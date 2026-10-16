"""Development-only routes. Not part of the public contract (docs/api-contract.md).

Mounted by main.create_app only when `dev_endpoints_enabled` is on; with the flag off these paths are 404.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import Connection

from bird_eye import work_orders
from bird_eye.db import get_conn
from bird_eye.schemas import DevWorkOrderCreate, WorkOrder

router = APIRouter(prefix="/dev")


@router.post("/work-orders", response_model=WorkOrder)
def create_draft_work_order(
    body: DevWorkOrderCreate, request: Request, conn: Annotated[Connection, Depends(get_conn)]
) -> WorkOrder:
    """A draft work order in pending_approval over verified defects, until the agent exists."""
    return work_orders.create_draft(
        conn, request.app.state.settings, body.defect_ids, body.crew_type, body.description
    )
