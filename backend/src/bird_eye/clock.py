"""The server clock. Tests replace `now` to freeze time."""

from datetime import UTC, datetime


def now() -> datetime:
    return datetime.now(UTC)
