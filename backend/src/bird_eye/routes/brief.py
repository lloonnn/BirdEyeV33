from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import Connection

from bird_eye import briefs
from bird_eye.db import get_conn
from bird_eye.schemas import Brief

router = APIRouter()


@router.get("/brief/latest", response_model=Brief)
def get_latest_brief(request: Request, conn: Annotated[Connection, Depends(get_conn)]) -> Brief:
    return briefs.latest(conn, request.app.state.settings)
