"""Development-only routes. Not part of the public contract (docs/api-contract.md).

Mounted by main.create_app only when `dev_endpoints_enabled` is on; with the flag off these paths are 404.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import Connection

from bird_eye import clean_passes, work_orders
from bird_eye.defects import get_defect
from bird_eye.db import get_conn
from bird_eye.schemas import DevCleanPass, DevAgentRunResult, DevCleanPassResult, DevWorkOrderCreate, WorkOrder

router = APIRouter(prefix="/dev")


@router.post("/work-orders", response_model=WorkOrder)
def create_draft_work_order(
    body: DevWorkOrderCreate, request: Request, conn: Annotated[Connection, Depends(get_conn)]
) -> WorkOrder:
    """A draft work order in pending_approval over verified defects, until the agent exists."""
    return work_orders.create_draft(
        conn, request.app.state.settings, body.defect_ids, body.crew_type, body.description
    )


@router.post("/defects/{defect_id}/clean-pass", response_model=DevCleanPassResult)
def record_clean_pass(
    defect_id: int, body: DevCleanPass, request: Request, conn: Annotated[Connection, Depends(get_conn)]
) -> DevCleanPassResult:
    """A later pass that saw the spot and found no defect. Confirms a fixed defect when enough accrue."""
    settings = request.app.state.settings
    passes, days = clean_passes.record(conn, settings, defect_id, body.at)
    defect = get_defect(conn, settings, request.app.state.storage, defect_id)
    return DevCleanPassResult(defect=defect, clean_passes=passes, clean_days=days)


@router.post("/agents/{agent}", response_model=DevAgentRunResult)
def start_agent_run(agent: Literal["work-order", "brief"], request: Request) -> DevAgentRunResult:
    """Start one agent run now (there is no scheduler). A Gemini failure is reported as outcome error."""
    from bird_eye.agents import service  # keeps google-genai out of every other route

    result = service.run_agent(request.app.state.engine, request.app.state.settings, agent)
    return DevAgentRunResult(run_id=result.run_id, outcome=result.outcome, error=result.error)
