"""Errors in FastAPI's default format, `{"detail": ...}` (decision 79)."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class NotFoundError(Exception):
    """The ID or resource does not exist: 404."""


class ConflictError(Exception):
    """The action is not allowed in the item's current status: 409."""


def invalid(loc: tuple[str | int, ...], msg: str, value: Any = None) -> RequestValidationError:
    """A 422 in FastAPI's validation format, for checks the request models cannot express."""
    return RequestValidationError([{"type": "value_error", "loc": loc, "msg": msg, "input": value}])


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFoundError)
    async def not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(ConflictError)
    async def conflict(_: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=409)
