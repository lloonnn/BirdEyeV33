"""Storing a validated detection batch (architecture.md section 5, Ingest)."""

import json
from typing import Any

from sqlalchemy import Connection, text

from bird_eye.merge import lock_merges, merge_sighting
from bird_eye.reviews import queue_review
from bird_eye.schemas import BatchResult, DetectionRecord
from bird_eye.settings import Settings
from bird_eye.storage import CropStorage

_INSERT_SIGHTING = text(
    """
    INSERT INTO sightings (client_id, device_id, captured_at, defect_type, confidence, band,
                           record, defect_geog, crop_key)
    VALUES (:client_id, :device_id, :captured_at, :defect_type, :confidence, :band,
            CAST(:record AS jsonb), ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :crop_key)
    ON CONFLICT (client_id) DO NOTHING
    RETURNING id
    """
)

def crop_key(client_id: str) -> str:
    # Built from the validated client_id, never from the uploaded part name.
    return f"{client_id}.jpg"


def store_batch(
    conn: Connection,
    settings: Settings,
    storage: CropStorage,
    records: list[tuple[DetectionRecord, dict[str, Any]]],
    crops: dict[str, bytes],
) -> BatchResult:
    """Insert each new record, save its crop and merge it. A known client_id is a duplicate.

    Records are handled in captured_at order, so a late or shuffled batch merges as it was driven.
    """
    lock_merges(conn)
    accepted = duplicates = 0
    for record, raw in sorted(records, key=lambda item: item[0].captured_at):
        key = crop_key(record.client_id)
        sighting_id = conn.execute(
            _INSERT_SIGHTING,
            {
                "client_id": record.client_id,
                "device_id": record.device_id,
                "captured_at": record.captured_at,
                "defect_type": record.defect_type,
                "confidence": record.confidence,
                "band": record.band,
                "record": json.dumps(raw),
                "lat": record.defect_point.lat,
                "lon": record.defect_point.lon,
                "crop_key": key,
            },
        ).scalar_one_or_none()
        if sighting_id is None:
            duplicates += 1
            continue
        accepted += 1
        storage.save(key, crops[record.crop_file])
        merge_sighting(conn, settings, sighting_id)
        queue_review(conn, settings, sighting_id)
    return BatchResult(accepted=accepted, duplicates=duplicates)

