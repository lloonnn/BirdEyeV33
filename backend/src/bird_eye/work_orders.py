"""Work orders: drafts, edits, approval and completion. Agents only draft; every action is a supervisor's."""

from collections.abc import Sequence
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, text

from bird_eye import clock, lifecycle
from bird_eye.errors import ConflictError, NotFoundError, invalid
from bird_eye.schemas import WorkOrder, WorkOrderPatch
from bird_eye.settings import Settings

_SELECT = """
SELECT w.id, w.status, w.crew_type, w.description, w.created_at, w.approved_at,
       COALESCE(array_agg(wd.defect_id ORDER BY wd.defect_id) FILTER (WHERE wd.defect_id IS NOT NULL),
                '{}') AS defect_ids
FROM work_orders w LEFT JOIN work_order_defects wd ON wd.work_order_id = w.id
"""


def _to_work_order(row, settings: Settings) -> WorkOrder:
    tz = ZoneInfo(settings.local_timezone)
    return WorkOrder(
        id=row["id"],
        status=row["status"],
        crew_type=row["crew_type"],
        description=row["description"],
        defect_ids=list(row["defect_ids"]),
        created_at=row["created_at"].astimezone(tz),
        approved_at=row["approved_at"].astimezone(tz) if row["approved_at"] else None,
    )


def list_work_orders(conn: Connection, settings: Settings, status: str | None) -> list[WorkOrder]:
    where = " WHERE w.status = :status" if status else ""
    rows = conn.execute(
        text(_SELECT + where + " GROUP BY w.id ORDER BY w.id"), {"status": status}
    ).mappings().all()
    return [_to_work_order(r, settings) for r in rows]


def get_work_order(conn: Connection, settings: Settings, work_order_id: int) -> WorkOrder:
    row = conn.execute(
        text(_SELECT + " WHERE w.id = :id GROUP BY w.id"), {"id": work_order_id}
    ).mappings().one_or_none()
    if row is None:
        raise NotFoundError(f"Work order {work_order_id} not found")
    return _to_work_order(row, settings)


def create_draft(
    conn: Connection,
    settings: Settings,
    defect_ids: Sequence[int],
    crew_type: str,
    description: str,
    agent_run_id: int | None = None,
) -> WorkOrder:
    """A work order in pending_approval over verified defects. Used by /dev and by the work order agent."""
    ids = sorted(set(defect_ids))
    found = dict(
        conn.execute(text("SELECT id, status FROM defects WHERE id = ANY(:ids)"), {"ids": ids}).all()
    )
    missing = [i for i in ids if i not in found]
    if missing:
        raise invalid(("body", "defect_ids"), f"defects not found: {missing}")
    not_verified = [f"{i} ({found[i]})" for i in ids if found[i] != "verified"]
    if not_verified:
        raise invalid(("body", "defect_ids"), f"every defect must be verified: {', '.join(not_verified)}")
    work_order_id = conn.execute(
        text(
            "INSERT INTO work_orders (crew_type, description, created_at, agent_run_id) "
            "VALUES (:crew_type, :description, :now, :run) RETURNING id"
        ),
        {"crew_type": crew_type, "description": description, "now": clock.now(), "run": agent_run_id},
    ).scalar_one()
    conn.execute(
        text("INSERT INTO work_order_defects (work_order_id, defect_id) VALUES (:wo, :d)"),
        [{"wo": work_order_id, "d": i} for i in ids],
    )
    return get_work_order(conn, settings, work_order_id)


def _lock(conn: Connection, work_order_id: int) -> str:
    status = conn.execute(
        text("SELECT status FROM work_orders WHERE id = :id FOR UPDATE"), {"id": work_order_id}
    ).scalar_one_or_none()
    if status is None:
        raise NotFoundError(f"Work order {work_order_id} not found")
    return status


def _require(status: str, work_order_id: int, allowed: str, action: str) -> None:
    if status != allowed:
        article = "an" if allowed[0] in "aeiou" else "a"
        raise ConflictError(
            f"Work order {work_order_id} is {status}; only {article} {allowed} work order can be {action}"
        )


def _defect_ids(conn: Connection, work_order_id: int) -> list[int]:
    return list(
        conn.execute(
            text("SELECT defect_id FROM work_order_defects WHERE work_order_id = :id ORDER BY defect_id"),
            {"id": work_order_id},
        ).scalars()
    )


def approve(conn: Connection, settings: Settings, work_order_id: int) -> WorkOrder:
    """pending_approval to approved; its defects go from verified to scheduled and point at it."""
    _require(_lock(conn, work_order_id), work_order_id, "pending_approval", "approved")
    ids = _defect_ids(conn, work_order_id)
    states = conn.execute(
        text("SELECT id, status FROM defects WHERE id = ANY(:ids) ORDER BY id FOR UPDATE"), {"ids": ids}
    ).all()
    for defect_id, status in states:
        if status != "verified":
            raise ConflictError(
                f"Defect {defect_id} is {status}; every defect on a work order must be verified to approve it"
            )
    conn.execute(
        text("UPDATE work_orders SET status = 'approved', approved_at = :now WHERE id = :id"),
        {"now": clock.now(), "id": work_order_id},
    )
    for defect_id in ids:
        lifecycle.transition(conn, defect_id, "scheduled", note=f"work order {work_order_id} approved")
        conn.execute(
            text("UPDATE defects SET work_order_id = :wo WHERE id = :id"), {"wo": work_order_id, "id": defect_id}
        )
    return get_work_order(conn, settings, work_order_id)


def reject(conn: Connection, settings: Settings, work_order_id: int) -> WorkOrder:
    """pending_approval to rejected. Its defects do not change, so they stay verified."""
    _require(_lock(conn, work_order_id), work_order_id, "pending_approval", "rejected")
    conn.execute(text("UPDATE work_orders SET status = 'rejected' WHERE id = :id"), {"id": work_order_id})
    return get_work_order(conn, settings, work_order_id)


def done(conn: Connection, settings: Settings, work_order_id: int) -> WorkOrder:
    """approved to done; its defects go from scheduled to fixed."""
    _require(_lock(conn, work_order_id), work_order_id, "approved", "marked done")
    conn.execute(text("UPDATE work_orders SET status = 'done' WHERE id = :id"), {"id": work_order_id})
    for defect_id in _defect_ids(conn, work_order_id):
        lifecycle.transition(conn, defect_id, "fixed", note=f"work order {work_order_id} done")
    return get_work_order(conn, settings, work_order_id)


def patch(conn: Connection, settings: Settings, work_order_id: int, changes: WorkOrderPatch) -> WorkOrder:
    """Edit a draft. defect_ids may only remove defects: an ID not on the job is 422, an empty list 409."""
    _require(_lock(conn, work_order_id), work_order_id, "pending_approval", "edited")
    if changes.defect_ids is not None:
        current = set(_defect_ids(conn, work_order_id))
        keep = set(changes.defect_ids)
        if extra := sorted(keep - current):
            raise invalid(("body", "defect_ids"), f"defects not on this work order: {extra}")
        if not keep:
            raise ConflictError(f"Work order {work_order_id} must keep at least one defect")
        conn.execute(
            text("DELETE FROM work_order_defects WHERE work_order_id = :id AND defect_id <> ALL(:keep)"),
            {"id": work_order_id, "keep": sorted(keep)},
        )
    if changes.description is not None:
        conn.execute(
            text("UPDATE work_orders SET description = :v WHERE id = :id"),
            {"v": changes.description, "id": work_order_id},
        )
    if changes.crew_type is not None:
        conn.execute(
            text("UPDATE work_orders SET crew_type = :v WHERE id = :id"),
            {"v": changes.crew_type, "id": work_order_id},
        )
    return get_work_order(conn, settings, work_order_id)
