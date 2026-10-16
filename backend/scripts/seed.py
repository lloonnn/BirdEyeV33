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
from bird_eye.lifecycle import record_history
from bird_eye.settings import get_settings
from bird_eye.storage import LocalDiskStorage
from bird_eye.urgency import location_term, size_term

# Test area centre: the contract's example point.
CENTRE_LAT, CENTRE_LON = 3.1834, 101.5139
PLACEHOLDER_CROP = Path(__file__).resolve().parent.parent / "tests" / "data" / "crop.jpg"
DEVICE = "seed-invented"

# (metres north, metres east, type, status, size term, age in days, sightings)
# Invented values chosen to cover both types, all three urgency bands, and the statuses a defect can
# have without a work order: detected, verified and rejected. Scheduled, fixed and confirmed defects
# need a job behind them (decision 84), so Phase 3 seeds them with real work orders.
# The location term is computed from config/test_area_points.toml, like a real defect's.
SEEDS = [
    (120, 80, "pothole", "detected", 0.9, 30, 2),
    (-200, 150, "pothole", "detected", 0.3, 3, 1),
    (300, -250, "crack", "detected", 0.4, 12, 1),
    (-450, -300, "crack", "detected", 0.1, 1, 1),
    (-750, -50, "pothole", "detected", 0.6, 18, 2),
    (50, 800, "crack", "detected", 0.2, 9, 1),
    (500, 400, "pothole", "verified", 0.8, 25, 3),
    (-600, 200, "crack", "verified", 0.5, 10, 3),
    (250, 600, "pothole", "verified", 0.2, 4, 3),
    (-100, -650, "pothole", "verified", 0.7, 20, 3),
    (700, -100, "crack", "verified", 0.3, 15, 3),
    (-300, 700, "pothole", "verified", 0.5, 28, 4),
    (650, 550, "crack", "verified", 0.1, 22, 3),
    (-550, -600, "pothole", "rejected", 0.2, 6, 1),
    (400, -700, "crack", "rejected", 0.1, 2, 1),
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
        for n, (north, east, kind, status, size, age_days, count) in enumerate(SEEDS, 1):
            lat, lon = offset(north, east)
            first_seen = now - timedelta(days=age_days)
            location, reasons = location_term(lat, lon, settings)
            # A square box whose area gives the wanted size term.
            side = math.sqrt(size * settings.size_area_max)
            bbox = [0.40, 0.50, round(0.40 + side, 4), round(0.50 + side, 4)]
            defect_id = conn.execute(
                text(
                    """
                    INSERT INTO defects (type, status, geog, first_seen, last_seen, type_term, size_term,
                                         location_term, location_reasons, invented)
                    VALUES (:type, :status, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                            :first_seen, :first_seen, :type_term, :size, :location, :reasons, true)
                    RETURNING id
                    """
                ),
                {
                    "type": kind, "status": status, "lat": lat, "lon": lon, "first_seen": first_seen,
                    "type_term": settings.type_term(kind), "size": size_term(side * side, settings),
                    "location": location, "reasons": reasons,
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
                    "bbox": bbox,
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
                                               negative_example, invented)
                        VALUES (:client_id, :device, :captured_at, :type, :confidence, 'save',
                                CAST(:record AS jsonb),
                                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                                :crop_key, :defect_id, 1, :negative, true)
                        RETURNING id
                        """
                    ),
                    {
                        "client_id": client_id, "device": DEVICE, "captured_at": captured_at, "type": kind,
                        "confidence": confidence, "record": json.dumps(record), "lat": lat, "lon": lon,
                        "crop_key": key, "defect_id": defect_id, "negative": status == "rejected",
                    },
                ).scalar_one()
                if confidence > best_conf:
                    best_id, best_conf = sighting_id, confidence
                last_seen = captured_at
            conn.execute(
                text("UPDATE defects SET best_sighting_id = :best, last_seen = :last WHERE id = :id"),
                {"best": best_id, "last": last_seen, "id": defect_id},
            )
            # History: detected at first sight, then the supervisor's move an hour after the last sighting.
            record_history(conn, defect_id, "detected", first_seen, note="invented seed")
            if status != "detected":
                record_history(conn, defect_id, status, last_seen + timedelta(hours=1), note="invented seed")

    print(f"INVENTED DATA: seeded {len(SEEDS)} defects")
    return 0


if __name__ == "__main__":
    sys.exit(main())
