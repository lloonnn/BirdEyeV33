from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import Connection

from bird_eye import work_orders
from bird_eye.db import get_conn
from bird_eye.schemas import WorkOrder, WorkOrderPatch, WorkOrderStatus

router = APIRouter()

Conn = Annotated[Connection, Depends(get_conn)]


@router.get("/work-orders", response_model=list[WorkOrder])
def get_work_orders(
    request: Request, conn: Conn, status: Annotated[WorkOrderStatus | None, Query()] = None
) -> list[WorkOrder]:
    return work_orders.list_work_orders(conn, request.app.state.settings, status)


@router.get("/work-orders/{work_order_id}", response_model=WorkOrder)
def get_work_order(work_order_id: int, request: Request, conn: Conn) -> WorkOrder:
    return work_orders.get_work_order(conn, request.app.state.settings, work_order_id)


@router.patch("/work-orders/{work_order_id}", response_model=WorkOrder)
def patch_work_order(work_order_id: int, body: WorkOrderPatch, request: Request, conn: Conn) -> WorkOrder:
    return work_orders.patch(conn, request.app.state.settings, work_order_id, body)


@router.post("/work-orders/{work_order_id}/approve", response_model=WorkOrder)
def approve_work_order(work_order_id: int, request: Request, conn: Conn) -> WorkOrder:
    return work_orders.approve(conn, request.app.state.settings, work_order_id)


@router.post("/work-orders/{work_order_id}/reject", response_model=WorkOrder)
def reject_work_order(work_order_id: int, request: Request, conn: Conn) -> WorkOrder:
    return work_orders.reject(conn, request.app.state.settings, work_order_id)


@router.post("/work-orders/{work_order_id}/done", response_model=WorkOrder)
def done_work_order(work_order_id: int, request: Request, conn: Conn) -> WorkOrder:
    return work_orders.done(conn, request.app.state.settings, work_order_id)
