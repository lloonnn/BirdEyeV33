"""Tests run against the real PostGIS test database (birdeye_test). Start it first:

    docker compose up -d db
"""

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from bird_eye import clock
from bird_eye.main import create_app
from bird_eye.maintenance import reset_all
from bird_eye.settings import Settings

BACKEND = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / "data"
CROP = (DATA / "crop.jpg").read_bytes()
MYT = ZoneInfo("Asia/Kuala_Lumpur")
FROZEN_NOW = datetime(2026, 10, 15, 10, 0, tzinfo=MYT)


@pytest.fixture(scope="session")
def settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    base = Settings()
    return Settings(
        database_url=base.test_database_url,
        crop_dir=str(tmp_path_factory.mktemp("crops")),
        location_points_file=str(DATA / "test_points.toml"),
        dev_endpoints_enabled=True,
        gemini_api_key=None,  # tests never reach the real Gemini, whatever backend/.env holds
        gemini_model=None,
    )


@pytest.fixture(scope="session")
def app(settings: Settings):
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(cfg, "head")
    app = create_app(settings)
    yield app
    app.state.engine.dispose()


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch: pytest.MonkeyPatch) -> datetime:
    monkeypatch.setattr(clock, "now", lambda: FROZEN_NOW)
    return FROZEN_NOW


@pytest.fixture
def client(app) -> TestClient:
    reset_all(app.state.engine, app.state.storage)
    return TestClient(app)


@pytest.fixture
def engine(app):
    return app.state.engine


def make_record(client_id: str = "t-1", **overrides: Any) -> dict[str, Any]:
    record = {
        "client_id": client_id,
        "device_id": "car-03",
        "captured_at": "2026-10-15T08:14:22+08:00",
        "defect_type": "pothole",
        "confidence": 0.91,
        "band": "save",
        "bbox": [0.40, 0.55, 0.52, 0.70],
        "vehicle": {"lat": 3.1834, "lon": 101.5139, "gps_accuracy_m": 4.2, "heading_deg": 87, "speed_kmh": 36},
        "distance_ahead_m": 14.5,
        "defect_point": {"lat": 3.1834, "lon": 101.5142},
        "model_version": "m-2026-10-01",
        "urgent": False,
        "crop_file": "crop.jpg",
    }
    record.update(overrides)
    return record


def post_batch(client: TestClient, records: list[dict[str, Any]], crops: dict[str, bytes] | None = None):
    crops = {"crop.jpg": CROP} if crops is None else crops
    files = [(name, (name, data, "image/jpeg")) for name, data in crops.items()]
    return client.post("/detections/batch", data={"records": json.dumps(records)}, files=files)


def at(day: int, hh: int, mm: int = 0) -> str:
    """A captured_at on 2026-10-<day> in Malaysia time, as the phone sends it."""
    return datetime(2026, 10, day, hh, mm, tzinfo=MYT).isoformat()


def moved(lat: float, lon: float, north_m: float = 0, east_m: float = 0) -> dict[str, float]:
    """A defect_point moved by metres north and east."""
    return {"lat": lat + north_m / 111_320, "lon": lon + east_m / (111_320 * math.cos(math.radians(lat)))}


BASE = {"lat": 3.1834, "lon": 101.5142}


def sight(client: TestClient, client_id: str, when: str, north_m: float = 0, east_m: float = 0, **overrides):
    """Post one record as its own batch and return the response."""
    record = make_record(
        client_id, captured_at=when, defect_point=moved(BASE["lat"], BASE["lon"], north_m, east_m), **overrides
    )
    response = post_batch(client, [record])
    assert response.status_code == 200, response.text
    return response


def defects(client: TestClient) -> list[dict[str, Any]]:
    return client.get("/defects", params={"bbox": "101.0,3.0,102.0,3.5"}).json()


def only_defect(client: TestClient) -> dict[str, Any]:
    found = defects(client)
    assert len(found) == 1, found
    return found[0]


def move_defect(engine, defect_id: int, *statuses: str) -> None:
    """Walk a defect through lifecycle moves that later phases' endpoints will make."""
    from bird_eye import lifecycle

    with engine.begin() as conn:
        for status in statuses:
            lifecycle.transition(conn, defect_id, status)


def verified_defect(client: TestClient, client_id: str, north_m: float = 0) -> int:
    """Sight a defect and verify it as a supervisor; returns its id. Spots 50 m apart do not merge."""
    sight(client, client_id, at(14, 9), north_m=north_m)
    defect_id = max(d["id"] for d in defects(client))
    assert client.post(f"/defects/{defect_id}/verify").status_code == 200
    return defect_id


def draft(client: TestClient, *defect_ids: int, crew_type: str = "patching", description: str = "Patch it"):
    response = client.post(
        "/dev/work-orders",
        json={"defect_ids": list(defect_ids), "crew_type": crew_type, "description": description},
    )
    assert response.status_code == 200, response.text
    return response.json()


def count(engine, table: str) -> int:
    with engine.connect() as conn:
        return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
