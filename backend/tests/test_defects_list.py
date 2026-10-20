from datetime import timedelta

from sqlalchemy import text

from tests.conftest import FROZEN_NOW, make_record, post_batch

INSIDE = "101.510,3.180,101.520,3.190"


def insert_defects(engine, rows: list[dict]) -> None:
    """Insert defects directly; rows give status and size term, all inside INSIDE."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO defects (type, status, geog, first_seen, last_seen, type_term, size_term)
                VALUES ('pothole', :status, ST_SetSRID(ST_MakePoint(101.5142, 3.1834), 4326)::geography,
                        :seen, :seen, 1.0, :size)
                """
            ),
            [{"status": r.get("status", "detected"), "size": r["size"], "seen": FROZEN_NOW - timedelta(days=1)}
             for r in rows],
        )


def test_bbox_includes_inside_excludes_outside(client):
    far = make_record("far", defect_point={"lat": 3.2500, "lon": 101.6000})
    post_batch(client, [make_record("near"), far])
    body = client.get("/defects", params={"bbox": INSIDE}).json()
    assert len(body) == 1
    defect = body[0]
    assert abs(defect["lat"] - 3.1834) < 1e-6 and abs(defect["lon"] - 101.5142) < 1e-6
    assert defect["status"] == "detected"
    assert defect["segment_id"] is None
    assert defect["work_order_id"] is None
    assert defect["location_reasons"] == []
    assert defect["sighting_count"] == 1
    assert defect["crop_url"] == "/crops/near.jpg"
    assert defect["first_seen"] == "2026-10-15T08:14:22+08:00"
    assert set(defect) == {
        "id", "type", "status", "urgency", "urgency_band", "urgency_terms", "lat", "lon", "first_seen",
        "last_seen", "sighting_count", "crop_url", "segment_id", "work_order_id", "confirmed_at",
        "location_reasons",
    }


def test_status_list_filter(client, engine):
    insert_defects(engine, [{"status": s, "size": 0.1} for s in ("detected", "verified", "scheduled", "fixed")])
    body = client.get("/defects", params={"bbox": INSIDE, "status": "verified,scheduled"}).json()
    assert sorted(d["status"] for d in body) == ["scheduled", "verified"]
    assert client.get("/defects", params={"bbox": INSIDE, "status": "verified,open"}).status_code == 422


def test_sort_urgency_desc_and_limit(client, engine):
    insert_defects(engine, [{"size": 0.1}, {"size": 0.9}, {"size": 0.5}])
    body = client.get("/defects", params={"bbox": INSIDE, "sort": "urgency_desc", "limit": 2}).json()
    assert [d["urgency_terms"]["size"] for d in body] == [0.9, 0.5]
    assert body[0]["urgency"] > body[1]["urgency"]
    assert client.get("/defects", params={"bbox": INSIDE, "sort": "age"}).status_code == 422


def test_default_sort_and_limit(client, engine):
    insert_defects(engine, [{"size": (i % 100) / 100} for i in range(600)])
    body = client.get("/defects", params={"bbox": INSIDE}).json()
    assert len(body) == 500
    urgencies = [d["urgency"] for d in body]
    assert urgencies == sorted(urgencies, reverse=True)


def test_limit_above_max_capped(client, engine):
    insert_defects(engine, [{"size": 0.1}] * 1100)
    response = client.get("/defects", params={"bbox": INSIDE, "limit": 5000})
    assert response.status_code == 200
    assert len(response.json()) == 1000


def test_limit_zero_422(client):
    assert client.get("/defects", params={"bbox": INSIDE, "limit": 0}).status_code == 422
    assert client.get("/defects", params={"bbox": INSIDE, "limit": -3}).status_code == 422
    assert client.get("/defects", params={"bbox": INSIDE, "limit": "ten"}).status_code == 422


def test_missing_bbox_422(client):
    assert client.get("/defects").status_code == 422
    assert client.get("/defects", params={"bbox": "101.52,3.18,101.51,3.19"}).status_code == 422
    assert client.get("/defects", params={"bbox": "1,2,3"}).status_code == 422
