"""Database engine and the per-request connection."""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Connection, Engine, create_engine


def make_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True)


def get_conn(request: Request) -> Iterator[Connection]:
    """One transaction per request; committed when the handler returns."""
    with request.app.state.engine.begin() as conn:
        yield conn
