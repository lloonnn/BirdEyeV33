from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import Connection

from bird_eye.db import get_conn
from bird_eye.defects import list_defects
from bird_eye.errors import invalid
from bird_eye.schemas import DEFECT_STATUSES, Defect, DefectType

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
