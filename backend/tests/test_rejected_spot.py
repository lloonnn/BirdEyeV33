from sqlalchemy import text

from tests.conftest import at, count, defects, only_defect, sight


def test_sighting_near_rejected_creates_no_defect(client, engine):
    sight(client, "r-1", at(14, 9))
    rejected_id = only_defect(client)["id"]
    client.post(f"/defects/{rejected_id}/reject")
    sight(client, "r-2", at(14, 11), east_m=5)
    assert count(engine, "defects") == 1
    assert only_defect(client)["status"] == "rejected"
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT defect_id, near_rejected_defect_id FROM sightings WHERE client_id = 'r-2'")
        ).one()
    assert row.defect_id is None
    assert row.near_rejected_defect_id == rejected_id


def test_open_defect_wins_over_rejected(client):
    sight(client, "r-1", at(14, 9))
    sight(client, "r-2", at(14, 9, 1), east_m=10)
    by_lon = sorted(defects(client), key=lambda d: d["lon"])
    rejected_id, open_id = by_lon[0]["id"], by_lon[1]["id"]
    client.post(f"/defects/{rejected_id}/reject")
    sight(client, "r-3", at(14, 11), east_m=5)  # 5 m from both
    detail = client.get(f"/defects/{open_id}").json()
    assert detail["sighting_count"] == 2
    assert client.get(f"/defects/{rejected_id}").json()["sighting_count"] == 1


def test_review_band_near_rejected_is_linked(client, engine):
    sight(client, "r-1", at(14, 9))
    rejected_id = only_defect(client)["id"]
    client.post(f"/defects/{rejected_id}/reject")
    sight(client, "r-2", at(14, 11), east_m=3, band="review", confidence=0.5)
    with engine.connect() as conn:
        linked = conn.execute(
            text("SELECT near_rejected_defect_id FROM sightings WHERE client_id = 'r-2'")
        ).scalar_one()
    assert linked == rejected_id
