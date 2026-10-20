"""Daily briefs: stored by the brief agent, read by GET /brief/latest."""

from zoneinfo import ZoneInfo

from sqlalchemy import Connection, text

from bird_eye.errors import NotFoundError
from bird_eye.schemas import Brief
from bird_eye.settings import Settings


def latest(conn: Connection, settings: Settings) -> Brief:
    row = conn.execute(text("SELECT id, created_at, text FROM briefs ORDER BY id DESC LIMIT 1")).mappings().one_or_none()
    if row is None:
        raise NotFoundError("No brief yet")
    ids = conn.execute(
        text("SELECT defect_id FROM brief_defects WHERE brief_id = :id ORDER BY defect_id"), {"id": row["id"]}
    ).scalars().all()
    return Brief(
        id=row["id"],
        created_at=row["created_at"].astimezone(ZoneInfo(settings.local_timezone)),
        text=row["text"],
        defect_ids=list(ids),
    )
