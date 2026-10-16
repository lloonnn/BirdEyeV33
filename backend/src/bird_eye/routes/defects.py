from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import Connection, text

from bird_eye.db import get_conn
from bird_eye import lifecycle
from bird_eye.defects import get_defect, get_defect_detail, list_defects
from bird_eye.errors import invalid
from bird_eye.schemas import DEFECT_STATUSES, Defect, DefectDetail, DefectType

router = APIRouter()


def _parse_bbox(raw: str) -> tuple[float, float, float, float]:
    parts = raw.split(",")
    try:
        values = tuple(float(p) for p in parts)
    except ValueError:
        values = ()
    if len(values) != 4:
        raise invalid(("query", "bbox"), "bbox must be minLon,minLat,maxLon,maxLat", raw)
    min_lon, min_lat, max_lon, max_lat = values
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise invalid(("query", "bbox"), "bbox minimums must be below maximums and within range", raw)
    return values


def _parse_statuses(raw: str | None) -> list[str] | None:
    if raw is None:
        return None
    statuses = [s.strip() for s in raw.split(",")]
    unknown = [s for s in statuses if s not in DEFECT_STATUSES]
    if unknown:
        raise invalid(("query", "status"), f"unknown status: {', '.join(unknown)}", raw)
    return statuses


@router.get("/defects", response_model=list[Defect])
def get_defects(
    request: Request,
    conn: Annotated[Connection, Depends(get_conn)],
    bbox: Annotated[str, Query()],
    type: Annotated[DefectType | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    sort: Annotated[Literal["urgency_desc"], Query()] = "urgency_desc",
    limit: Annotated[int | None, Query(gt=0)] = None,
) -> list[Defect]:
    settings = request.app.state.settings
    # A limit above the maximum is a valid v0 request, so it is capped rather than rejected.
    effective_limit = min(limit or settings.defects_limit_default, settings.defects_limit_max)
    return list_defects(
        conn,
        settings,
        request.app.state.storage,
        bbox=_parse_bbox(bbox),
        defect_type=type,
        statuses=_parse_statuses(status),
        limit=effective_limit,
    )


@router.get("/defects/{defect_id}", response_model=DefectDetail)
def get_one_defect(
    defect_id: int, request: Request, conn: Annotated[Connection, Depends(get_conn)]
) -> DefectDetail:
    try:
        return get_defect_detail(conn, request.app.state.settings, request.app.state.storage, defect_id)
    except lifecycle.DefectNotFound as exc:
        raise HTTPException(404, str(exc)) from None


@router.post("/defects/{defect_id}/verify", response_model=Defect)
def verify_defect(defect_id: int, request: Request, conn: Annotated[Connection, Depends(get_conn)]) -> Defect:
    """Supervisor verify: detected to verified at once, without waiting for passes."""
    _move(conn, defect_id, "verified")
    return get_defect(conn, request.app.state.settings, request.app.state.storage, defect_id)


@router.post("/defects/{defect_id}/reject", response_model=Defect)
def reject_defect(defect_id: int, request: Request, conn: Annotated[Connection, Depends(get_conn)]) -> Defect:
    """Supervisor reject: detected to rejected; its crops become negative training examples."""
    _move(conn, defect_id, "rejected")
    conn.execute(text("UPDATE sightings SET negative_example = true WHERE defect_id = :id"), {"id": defect_id})
    return get_defect(conn, request.app.state.settings, request.app.state.storage, defect_id)


def _move(conn: Connection, defect_id: int, to_status: str) -> None:
    """Verify and reject are allowed only from detected (v0); anything else is 409."""
    current = conn.execute(
        text("SELECT status FROM defects WHERE id = :id FOR UPDATE"), {"id": defect_id}
    ).scalar_one_or_none()
    if current is None:
        raise HTTPException(404, f"Defect {defect_id} not found")
    if current != "detected":
        raise HTTPException(409, f"Defect {defect_id} is {current}; only a detected defect can be {to_status}")
    lifecycle.transition(conn, defect_id, to_status, note="supervisor")
