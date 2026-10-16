from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import Connection

from bird_eye import reviews
from bird_eye.db import get_conn
from bird_eye.schemas import Review, ReviewAnswer

router = APIRouter()


@router.get("/reviews", response_model=list[Review])
def get_reviews(
    request: Request,
    conn: Annotated[Connection, Depends(get_conn)],
    status: Annotated[Literal["pending", "answered"], Query()] = "pending",
) -> list[Review]:
    return reviews.list_reviews(conn, request.app.state.storage, status)


@router.post("/reviews/{review_id}", response_model=Review)
def answer_review(
    review_id: int,
    body: ReviewAnswer,
    request: Request,
    conn: Annotated[Connection, Depends(get_conn)],
) -> Review:
    return reviews.answer_review(
        conn, request.app.state.settings, request.app.state.storage, review_id, body.answer, body.class_
    )
