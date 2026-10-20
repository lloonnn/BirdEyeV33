"""Merging sightings into defects (architecture.md section 5, Merge; plan Choices item 1).

For a new save-band sighting, among defects of the same type within merge_radius_m, nearest first:
  (a) an open defect (detected, verified, scheduled) gets the sighting;
  (b) else a fixed or confirmed defect is reopened, if the sighting is newer than the fix;
  (c) else a rejected defect: the sighting creates nothing and counts toward nothing;
  (d) else a new defect in detected.
"""

from datetime import timedelta

from sqlalchemy import Connection, text

from bird_eye import lifecycle
from bird_eye.passes import count_passes
from bird_eye.settings import Settings
from bird_eye.urgency import location_term, size_term

OPEN = ("detected", "verified", "scheduled")
REOPENABLE = ("fixed", "confirmed")

# One merge at a time: two batches must not both create a defect at one new spot.
MERGE_LOCK_KEY = 0x6269726465796531  # arbitrary constant


def lock_merges(conn: Connection) -> None:
    conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": MERGE_LOCK_KEY})


def merge_sighting(
    conn: Connection,
    settings: Settings,
    sighting_id: int,
    *,
    as_review_answer: bool = False,
    related_defect_id: int | None = None,
) -> None:
    """Merge one stored sighting. A supervisor's `correct` or `wrong_class` answer on a review passes
    as_review_answer: the sighting then merges as a save-band record and skips the rejected rule
    (Choices item 4). related_defect_id links a newly created defect to the rejected one in its history."""
    sighting = conn.execute(
        text("SELECT id, defect_type, band, captured_at FROM sightings WHERE id = :id"), {"id": sighting_id}
    ).mappings().one()
    candidates = conn.execute(
        text(
            """
            SELECT d.id, d.status, d.cycle
            FROM defects d, sightings s
            WHERE s.id = :sighting_id
              AND d.type = s.defect_type
              AND ST_DWithin(d.geog, s.defect_geog, :radius)
            ORDER BY ST_Distance(d.geog, s.defect_geog), d.id
            FOR UPDATE OF d
            """
        ),
        {"sighting_id": sighting_id, "radius": settings.merge_radius_m},
    ).mappings().all()

    def first(statuses: tuple[str, ...]):
        return next((c for c in candidates if c["status"] in statuses), None)

    if sighting["band"] == "review" and not as_review_answer:
        # Review-band records wait for a supervisor. Only the rejected-spot link is kept.
        if first(OPEN) is None and first(REOPENABLE) is None and (rejected := first(("rejected",))):
            _mark_near_rejected(conn, sighting_id, rejected["id"])
        return

    if open_defect := first(OPEN):
        attach(conn, settings, open_defect["id"], sighting_id)
    elif fixed := first(REOPENABLE):
        fixed_at = _entered_fixed_at(conn, fixed["id"])
        if fixed_at is None or sighting["captured_at"] > fixed_at:
            _reopen(conn, fixed["id"])
        attach(conn, settings, fixed["id"], sighting_id)
    elif not as_review_answer and (rejected := first(("rejected",))):
        _mark_near_rejected(conn, sighting_id, rejected["id"])
    else:
        create_defect(conn, settings, sighting_id, related_defect_id=related_defect_id)


def create_defect(
    conn: Connection, settings: Settings, sighting_id: int, *, related_defect_id: int | None = None
) -> int:
    """A new defect in detected at the sighting's point, cycle 1."""
    row = conn.execute(
        text(
            """
            INSERT INTO defects (type, status, geog, first_seen, last_seen, type_term, best_sighting_id, cycle)
            SELECT s.defect_type, 'detected', s.defect_geog, s.captured_at, s.captured_at, 0, s.id, 1
            FROM sightings s WHERE s.id = :sighting_id
            RETURNING id, first_seen
            """
        ),
        {"sighting_id": sighting_id},
    ).mappings().one()
    lifecycle.record_history(
        conn, row["id"], "detected", row["first_seen"], related_defect_id=related_defect_id
    )
    attach(conn, settings, row["id"], sighting_id)
    return row["id"]


def attach(conn: Connection, settings: Settings, defect_id: int, sighting_id: int) -> None:
    """Join the sighting to the defect's current cycle, refresh the defect, then check passes."""
    conn.execute(
        text(
            "UPDATE sightings SET defect_id = :defect_id, cycle = (SELECT cycle FROM defects WHERE id = :defect_id) "
            "WHERE id = :sighting_id"
        ),
        {"defect_id": defect_id, "sighting_id": sighting_id},
    )
    refresh_defect(conn, settings, defect_id)
    _verify_if_enough_passes(conn, settings, defect_id)


def refresh_defect(conn: Connection, settings: Settings, defect_id: int) -> None:
    """Position = average of all sightings; recompute seen times, best crop and stored urgency terms."""
    agg = conn.execute(
        text(
            """
            SELECT avg(ST_Y(defect_geog::geometry)) AS lat,
                   avg(ST_X(defect_geog::geometry)) AS lon,
                   min(captured_at) AS first_seen,
                   max(captured_at) AS last_seen,
                   max(((record->'bbox'->>2)::float8 - (record->'bbox'->>0)::float8)
                     * ((record->'bbox'->>3)::float8 - (record->'bbox'->>1)::float8)) AS largest_area,
                   (array_agg(id ORDER BY confidence DESC, id))[1] AS best_id,
                   (array_agg(defect_type))[1] AS type
            FROM sightings WHERE defect_id = :id
            """
        ),
        {"id": defect_id},
    ).mappings().one()
    loc, reasons = location_term(agg["lat"], agg["lon"], settings)
    conn.execute(
        text(
            """
            UPDATE defects SET
                geog = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                first_seen = LEAST(first_seen, :first_seen),
                last_seen = :last_seen,
                type_term = :type_term,
                size_term = :size_term,
                location_term = :location_term,
                location_reasons = :reasons,
                best_sighting_id = :best_id
            WHERE id = :id
            """
        ),
        {
            "id": defect_id,
            "lat": agg["lat"],
            "lon": agg["lon"],
            "first_seen": agg["first_seen"],
            "last_seen": agg["last_seen"],
            "type_term": settings.type_term(agg["type"]),
            "size_term": size_term(agg["largest_area"], settings),
            "location_term": loc,
            "reasons": reasons,
            "best_id": agg["best_id"],
        },
    )


def _verify_if_enough_passes(conn: Connection, settings: Settings, defect_id: int) -> None:
    """Detected to Verified at passes_to_verify passes, counted in the current cycle only."""
    defect = conn.execute(text("SELECT status, cycle FROM defects WHERE id = :id"), {"id": defect_id}).one()
    if defect.status != "detected":
        return
    times = conn.execute(
        text("SELECT captured_at FROM sightings WHERE defect_id = :id AND cycle = :cycle"),
        {"id": defect_id, "cycle": defect.cycle},
    ).scalars().all()
    passes = count_passes(times, timedelta(minutes=settings.pass_gap_minutes))
    if passes >= settings.passes_to_verify:
        lifecycle.transition(conn, defect_id, "verified", note=f"automatic: {passes} passes")


def _entered_fixed_at(conn: Connection, defect_id: int):
    return conn.execute(
        text("SELECT max(at) FROM defect_history WHERE defect_id = :id AND status = 'fixed'"), {"id": defect_id}
    ).scalar_one()


def _reopen(conn: Connection, defect_id: int) -> None:
    """A newer matching sighting reopens a fixed or confirmed defect; its history is kept."""
    conn.execute(
        text("UPDATE defects SET cycle = cycle + 1, work_order_id = NULL, confirmed_at = NULL WHERE id = :id"),
        {"id": defect_id},
    )
    lifecycle.transition(conn, defect_id, "detected", note="reopened by a newer sighting")


def _mark_near_rejected(conn: Connection, sighting_id: int, rejected_id: int) -> None:
    conn.execute(
        text("UPDATE sightings SET near_rejected_defect_id = :rejected WHERE id = :id"),
        {"rejected": rejected_id, "id": sighting_id},
    )
