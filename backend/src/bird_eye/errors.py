"""Validation errors in FastAPI's default 422 format (decision 79)."""

from typing import Any

from fastapi.exceptions import RequestValidationError


def invalid(loc: tuple[str | int, ...], msg: str, value: Any = None) -> RequestValidationError:
    return RequestValidationError([{"type": "value_error", "loc": loc, "msg": msg, "input": value}])
