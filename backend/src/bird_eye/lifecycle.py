"""Defect lifecycle (architecture.md section 5). Every status change goes through `transition`."""

from datetime import datetime

from sqlalchemy import Connection, text

from bird_eye import clock
from bird_eye.errors import ConflictError, NotFoundError

ALLOWED_MOVES: frozenset[tuple[str, str]] = frozenset(
    {
        ("detected", "verified"),
        ("detected", "rejected"),
        ("verified", "scheduled"),
        ("scheduled", "fixed"),
        ("fixed", "confirmed"),
        ("fixed", "detected"),
        ("confirmed", "detected"),
    }
)


class DefectNotFound(NotFoundError):
    def __init__(self, defect_id: int) -> None:
        super().__init__(f"Defect {defect_id} not found")


class IllegalTransition(ConflictError):
    def __init__(self, defect_id: int, current: str, target: str) -> None:
        super().__init__(f"Defect {defect_id} is {current}; it cannot move to {target}")


def record_history(
    conn: Connection,
    defect_id: int,
    status: str,
    at: datetime,
    *,
    related_defect_id: int | None = None,
    note: str | None = None,
) -> None:
    conn.execute(
        text(
            "INSERT INTO defect_history (defect_id, status, at, related_defect_id, note) "
            "VALUES (:defect_id, :status, :at, :related, :note)"
        ),
        {"defect_id": defect_id, "status": status, "at": at, "related": related_defect_id, "note": note},
    )


def transition(conn: Connection, defect_id: int, to_status: str, *, note: str | None = None) -> None:
    """Move a defect to `to_status` and record it in its history, in the caller's transaction."""
    current = conn.execute(
        text("SELECT status FROM defects WHERE id = :id FOR UPDATE"), {"id": defect_id}
    ).scalar_one_or_none()
    if current is None:
        raise DefectNotFound(defect_id)
    if (current, to_status) not in ALLOWED_MOVES:
        raise IllegalTransition(defect_id, current, to_status)
    conn.execute(text("UPDATE defects SET status = :status WHERE id = :id"), {"status": to_status, "id": defect_id})
    record_history(conn, defect_id, to_status, clock.now(), note=note)
