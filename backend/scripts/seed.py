"""Load INVENTED defects near the test area so the dashboard has pins in development.

    uv run python scripts/seed.py

INVENTED DATA. Not real detections or roads. Every row has invented = true and device seed-invented.
Reset the database before the demo with scripts/reset_dev_data.py --yes.
"""

import json
import math
import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy import text

from bird_eye import clock
from bird_eye.db import make_engine
from bird_eye.ingest import crop_key
from bird_eye.settings import get_settings
from bird_eye.storage import LocalDiskStorage

# Test area centre: the contract's example point.
CENTRE_LAT, CENTRE_LON = 3.1834, 101.5139
PLACEHOLDER_CROP = Path(__file__).resolve().parent.parent / "tests" / "data" / "crop.jpg"
DEVICE = "seed-invented"

# (metres north, metres east, type, status, size term, location term, location reasons, age in days, sightings)
# Invented values chosen to cover both types, every status and all three urgency bands.
SEEDS = [
    (120, 80, "pothole", "detected", 0.9, 1.0, ["school"], 30, 2),
    (-200, 150, "pothole", "detected", 0.3, 0.0, [], 3, 1),
    (300, -250, "crack", "detected", 0.4, 0.0, [], 12, 1),
    (-450, -300, "crack", "detected", 0.1, 0.0, [], 1, 1),
    (500, 400, "pothole", "verified", 0.8, 1.0, ["main_road"], 25, 3),
    (-600, 200, "crack", "verified", 0.5, 1.0, ["junction"], 10, 3),
    (250, 600, "pothole", "verified", 0.2, 0.0, [], 4, 3),
    (-100, -650, "pothole", "scheduled", 0.7, 1.0, ["school", "junction"], 20, 3),
    (700, -100, "crack", "scheduled", 0.3, 0.0, [], 15, 3),
    (-750, -50, "pothole", "fixed", 0.6, 0.0, [], 18, 3),
    (50, 800, "crack", "fixed", 0.2, 1.0, ["main_road"], 9, 3),
    (-300, 700, "pothole", "confirmed", 0.5, 0.0, [], 28, 4),
    (650, 550, "crack", "confirmed", 0.1, 0.0, [], 22, 3),
    (-550, -600, "pothole", "rejected", 0.2, 0.0, [], 6, 1),
    (400, -700, "crack", "rejected", 0.1, 0.0, [], 2, 1),
]


def offset(north_m: float, east_m: float) -> tuple[float, float]:
    lat = CENTRE_LAT + north_m / 111_320
    lon = CENTRE_LON + east_m / (111_320 * math.cos(math.radians(CENTRE_LAT)))
    return lat, lon


def main() -> int:
    settings = get_settings()
    engine = make_engine(settings.database_url)
    storage = LocalDiskStorage(settings.crop_dir, settings.crop_url_prefix)
    crop = PLACEHOLDER_CROP.read_bytes()
    now = clock.now()

    with engine.begin() as conn:
        if conn.execute(text("SELECT exists(SELECT 1 FROM defects WHERE invented)")).scalar_one():
            print("INVENTED DATA already present; run scripts/reset_dev_data.py --yes first.", file=sys.stderr)
            return 1
        for n, (north, east, kind, status, size, location, reasons, age_days, count) in enumerate(SEEDS, 1):
            lat, lon = offset(north, east)
            first_seen = now - timedelta(days=age_days)
            defect_id = conn.execute(
                text(
                    """
                    INSERT INTO defects (type, status, geog, first_seen, last_seen, type_term, size_term,
                                         location_term, location_reasons, confirmed_at, invented)
                    VALUES (:type, :status, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                            :first_seen, :first_seen, :type_term, :size, :location, :reasons,
                            :confirmed_at, true)
                    RETURNING id
                    """
                ),
                {
                    "type": kind, "status": status, "lat": lat, "lon": lon, "first_seen": first_seen,
                    "type_term": settings.type_term(kind), "size": size, "location": location,
                    "reasons": reasons,
                    "confirmed_at": now - timedelta(days=1) if status == "confirmed" else None,
                },
            ).scalar_one()

            best_id, best_conf, last_seen = None, -1.0, first_seen
            for k in range(count):
                client_id = f"seed-{n:02d}-{k + 1}"
                captured_at = first_seen + timedelta(hours=2 * k)
                confidence = round(0.82 + 0.04 * k, 2)
                record = {
                    "client_id": client_id, "device_id": DEVICE, "captured_at": captured_at.isoformat(),
                    "defect_type": kind, "confidence": confidence, "band": "save",
                    "bbox": [0.40, 0.55, 0.52, 0.70],
                    "vehicle": {"lat": lat, "lon": lon, "gps_accuracy_m": 4.0, "heading_deg": 90,
                                "speed_kmh": 30},
                    "distance_ahead_m": 10.0, "defect_point": {"lat": lat, "lon": lon},
                    "model_version": "seed-invented", "urgent": False, "crop_file": f"{client_id}.jpg",
                }
                key = crop_key(client_id)
                storage.save(key, crop)
                sighting_id = conn.execute(
                    text(
                        """
                        INSERT INTO sightings (client_id, device_id, captured_at, defect_type, confidence,
                                               band, record, defect_geog, crop_key, defect_id, cycle,
                                               invented)
                        VALUES (:client_id, :device, :captured_at, :type, :confidence, 'save',
                                CAST(:record AS jsonb),
                                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                                :crop_key, :defect_id, 1, true)
                        RETURNING id
                        """
                    ),
                    {
                        "client_id": client_id, "device": DEVICE, "captured_at": captured_at, "type": kind,
                        "confidence": confidence, "record": json.dumps(record), "lat": lat, "lon": lon,
                        "crop_key": key, "defect_id": defect_id,
                    },
                ).scalar_one()
                if confidence > best_conf:
                    best_id, best_conf = sighting_id, confidence
                last_seen = captured_at
            conn.execute(
                text("UPDATE defects SET best_sighting_id = :best, last_seen = :last WHERE id = :id"),
                {"best": best_id, "last": last_seen, "id": defect_id},
            )

    print(f"INVENTED DATA: seeded {len(SEEDS)} defects")
    return 0


if __name__ == "__main__":
    sys.exit(main())
