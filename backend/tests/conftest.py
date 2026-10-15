"""Tests run against the real PostGIS test database (birdeye_test). Start it first:

    docker compose up -d db
"""

import json
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
    return Settings(database_url=base.test_database_url, crop_dir=str(tmp_path_factory.mktemp("crops")))


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


def count(engine, table: str) -> int:
    with engine.connect() as conn:
        return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
