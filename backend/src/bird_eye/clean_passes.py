"""Confirming a repair from clean passes (dev only; tracks are cut, decision 93).

A clean pass counts by the cycle it was recorded in, not by comparing `at` with the time of the fix.
Clean passes use the same anchored pass rule as sightings (plan Choices item 5).
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, text

from bird_eye import clock, lifecycle
from bird_eye.errors import ConflictError, invalid
from bird_eye.passes import count_passes
from bird_eye.settings import Settings


def record(conn: Connection, settings: Settings, defect_id: int, at: datetime) -> tuple[int, int]:
    """Store a clean pass on a fixed defect; confirm it when enough passes fall on enough days.

    Returns (clean passes, distinct Malaysia days) for the defect's current cycle.
    """
    if at > clock.now() + timedelta(minutes=settings.max_future_skew_minutes):
        raise invalid(("body", "at"), "at is too far in the future", at.isoformat())
    row = conn.execute(
        text("SELECT status, cycle FROM defects WHERE id = :id FOR UPDATE"), {"id": defect_id}
    ).one_or_none()
    if row is None:
        raise lifecycle.DefectNotFound(defect_id)
    status, cycle = row
    if status != "fixed":
        raise ConflictError(f"Defect {defect_id} is {status}; clean passes count only while it is fixed")
    conn.execute(
        text("INSERT INTO clean_passes (defect_id, at, cycle) VALUES (:id, :at, :cycle)"),
        {"id": defect_id, "at": at, "cycle": cycle},
    )
    times = list(
        conn.execute(
            text("SELECT at FROM clean_passes WHERE defect_id = :id AND cycle = :cycle"),
            {"id": defect_id, "cycle": cycle},
        ).scalars()
    )
    passes = count_passes(times, timedelta(minutes=settings.pass_gap_minutes))
    tz = ZoneInfo(settings.local_timezone)
    days = len({t.astimezone(tz).date() for t in times})
    if passes >= settings.clean_passes_to_confirm and days >= settings.clean_pass_min_days:
        lifecycle.transition(conn, defect_id, "confirmed", note=f"{passes} clean passes on {days} days")
        conn.execute(text("UPDATE defects SET confirmed_at = :now WHERE id = :id"), {"now": clock.now(), "id": defect_id})
    return passes, days
