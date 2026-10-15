"""Storing a validated detection batch (architecture.md section 5, Ingest)."""

import json
from typing import Any

from sqlalchemy import Connection, text

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

_INSERT_DEFECT = text(
    """
    INSERT INTO defects (type, status, geog, first_seen, last_seen, type_term, best_sighting_id, cycle)
    SELECT s.defect_type, 'detected', s.defect_geog, s.captured_at, s.captured_at, :type_term, s.id, 1
    FROM sightings s WHERE s.id = :sighting_id
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
    """Insert each new record and save its crop. A known client_id is a duplicate and stores nothing."""
    accepted = duplicates = 0
    for record, raw in records:
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
        if record.band == "save":
            _create_own_defect(conn, settings, sighting_id, record.defect_type)
        # Review-band records are stored only; the review queue arrives in Phase 3.
    return BatchResult(accepted=accepted, duplicates=duplicates)


def _create_own_defect(conn: Connection, settings: Settings, sighting_id: int, defect_type: str) -> None:
    """TEMPORARY, replaced by merge in Phase 2: every save-band sighting gets its own defect."""
    defect_id = conn.execute(
        _INSERT_DEFECT, {"sighting_id": sighting_id, "type_term": settings.type_term(defect_type)}
    ).scalar_one()
    conn.execute(
        text("UPDATE sightings SET defect_id = :defect_id, cycle = 1 WHERE id = :sighting_id"),
        {"defect_id": defect_id, "sighting_id": sighting_id},
    )
