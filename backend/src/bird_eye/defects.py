"""Reading defects as v0 defect objects."""

from collections.abc import Sequence
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, text

from bird_eye import clock
from bird_eye.schemas import Defect, UrgencyTerms
from bird_eye.settings import Settings
from bird_eye.storage import CropStorage
from bird_eye.urgency import AGE_TERM_SQL, URGENCY_SQL, band, urgency_params

_SELECT = f"""
SELECT d.id, d.type, d.status, d.first_seen, d.last_seen,
       d.type_term, d.size_term, d.location_term, d.location_reasons,
       d.work_order_id, d.confirmed_at,
       ST_Y(d.geog::geometry) AS lat, ST_X(d.geog::geometry) AS lon,
       {AGE_TERM_SQL} AS age_term,
       {URGENCY_SQL} AS urgency,
       (SELECT count(*) FROM sightings s WHERE s.defect_id = d.id) AS sighting_count,
       best.crop_key AS best_crop_key
FROM defects d
LEFT JOIN sightings best ON best.id = d.best_sighting_id
"""


def list_defects(
    conn: Connection,
    settings: Settings,
    storage: CropStorage,
    *,
    bbox: tuple[float, float, float, float],
    defect_type: str | None,
    statuses: Sequence[str] | None,
    limit: int,
) -> list[Defect]:
    where = ["ST_Intersects(d.geog::geometry, ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326))"]
    params: dict[str, object] = urgency_params(settings, clock.now())
    params.update(min_lon=bbox[0], min_lat=bbox[1], max_lon=bbox[2], max_lat=bbox[3], limit=limit)
    if defect_type is not None:
        where.append("d.type = :type")
        params["type"] = defect_type
    if statuses:
        where.append("d.status = ANY(:statuses)")
        params["statuses"] = list(statuses)
    # urgency_desc is the only sort in v0; id breaks ties so the order is stable.
    sql = _SELECT + " WHERE " + " AND ".join(where) + " ORDER BY urgency DESC, d.id LIMIT :limit"
    rows = conn.execute(text(sql), params).mappings().all()
    return [_to_defect(row, settings, storage) for row in rows]


def _to_defect(row, settings: Settings, storage: CropStorage) -> Defect:
    tz = ZoneInfo(settings.local_timezone)
    urgency = round(float(row["urgency"]), 4)
    return Defect(
        id=row["id"],
        type=row["type"],
        status=row["status"],
        urgency=urgency,
        urgency_band=band(urgency, settings),
        urgency_terms=UrgencyTerms(
            type=round(row["type_term"], 4),
            size=round(row["size_term"], 4),
            location=round(row["location_term"], 4),
            age=round(float(row["age_term"]), 4),
        ),
        lat=row["lat"],
        lon=row["lon"],
        first_seen=row["first_seen"].astimezone(tz),
        last_seen=row["last_seen"].astimezone(tz),
        sighting_count=row["sighting_count"],
        crop_url=storage.url(row["best_crop_key"]) if row["best_crop_key"] else None,
        # No road segments in the prototype (decision 93).
        segment_id=None,
        work_order_id=row["work_order_id"],
        confirmed_at=row["confirmed_at"].astimezone(tz) if row["confirmed_at"] else None,
        location_reasons=list(row["location_reasons"]),
    )
