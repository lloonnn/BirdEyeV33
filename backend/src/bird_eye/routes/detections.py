import json
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from bird_eye import clock
from bird_eye.errors import invalid
from bird_eye.ingest import store_batch
from bird_eye.schemas import BatchResult, DetectionRecord

router = APIRouter()

JPEG_MAGIC = b"\xff\xd8\xff"


@router.post("/detections/batch", response_model=BatchResult)
async def post_detection_batch(request: Request) -> BatchResult:
    settings = request.app.state.settings
    async with request.form(max_files=settings.max_records_per_batch, max_fields=10) as form:
        records = await _read_records(form.get("records"), settings.max_records_per_batch)

        errors: list[dict[str, Any]] = []
        valid: list[tuple[DetectionRecord, dict[str, Any]]] = []
        latest_allowed = clock.now() + timedelta(minutes=settings.max_future_skew_minutes)
        for index, raw in enumerate(records):
            loc = ("body", "records", index)
            try:
                record = DetectionRecord.model_validate(raw)
            except ValidationError as exc:
                for err in exc.errors(include_url=False, include_context=False):
                    errors.append({**err, "loc": (*loc, *err["loc"])})
                continue
            if record.captured_at > latest_allowed:
                errors.append(
                    {"type": "value_error", "loc": (*loc, "captured_at"),
                     "msg": "captured_at is too far in the future", "input": raw.get("captured_at")}
                )
                continue
            valid.append((record, raw))

        crops: dict[str, bytes] = {}
        for record, _ in valid:
            name = record.crop_file
            if name in crops:
                continue
            part = form.get(name)
            loc = ("body", name)
            if not isinstance(part, UploadFile):
                errors.append({"type": "missing", "loc": loc, "msg": "crop file part missing", "input": None})
                continue
            data = await part.read(settings.max_crop_bytes + 1)
            if len(data) > settings.max_crop_bytes:
                errors.append({"type": "value_error", "loc": loc, "msg": "crop file too large", "input": None})
            elif not data.startswith(JPEG_MAGIC):
                errors.append({"type": "value_error", "loc": loc, "msg": "crop file is not a JPEG", "input": None})
            else:
                crops[name] = data

    # Any failure rejects the whole batch, so a batch is stored entirely or not at all.
    if errors:
        raise RequestValidationError(errors)

    def store() -> BatchResult:
        with request.app.state.engine.begin() as conn:
            return store_batch(conn, settings, request.app.state.storage, valid, crops)

    return await run_in_threadpool(store)


def _reject_constant(name: str) -> None:
    """json.loads accepts NaN and Infinity, which are not JSON. They would fail later when the record is
    stored as jsonb, even inside an ignored extra field, so they are refused at parse time."""
    raise ValueError(f"{name} is not valid JSON")


async def _read_records(part: Any, max_records: int) -> list[Any]:
    if part is None:
        raise invalid(("body", "records"), "records part missing")
    raw = await part.read() if isinstance(part, UploadFile) else part
    try:
        records = json.loads(raw, parse_constant=_reject_constant)
    except (ValueError, UnicodeDecodeError):
        raise invalid(("body", "records"), "records must be a JSON array") from None
    if not isinstance(records, list):
        raise invalid(("body", "records"), "records must be a JSON array")
    if len(records) > max_records:
        raise invalid(("body", "records"), f"at most {max_records} records per batch")
    if not all(isinstance(r, dict) for r in records):
        raise invalid(("body", "records"), "each record must be a JSON object")
    return records
