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


def reject_spot(client) -> int:
    """A defect sighted and rejected on 14 Oct 09:00; returns its id."""
    sight(client, "r-0", at(14, 9))
    rejected_id = only_defect(client)["id"]
    client.post(f"/defects/{rejected_id}/reject")
    return rejected_id


def test_daily_limit_then_correct_creates_linked_defect(client, engine):
    rejected_id = reject_spot(client)
    sight(client, "r-1", at(14, 11), east_m=3)
    sight(client, "r-2", at(14, 12), east_m=-3)  # same Malaysia day: stored, no second review
    sight(client, "r-3", at(15, 8), east_m=2, band="review", confidence=0.5)  # next day: a second review
    assert count(engine, "sightings") == 4
    reviews = client.get("/reviews").json()
    assert [r["sighting"]["client_id"] for r in reviews] == ["r-1", "r-3"]
    assert count(engine, "defects") == 1

    response = client.post(f"/reviews/{reviews[1]['id']}", json={"answer": "correct"})
    assert response.status_code == 200 and response.json()["status"] == "answered"
    by_id = {d["id"]: d for d in defects(client)}
    assert by_id[rejected_id]["status"] == "rejected"
    (new_id,) = [i for i in by_id if i != rejected_id]
    assert by_id[new_id]["status"] == "detected" and by_id[new_id]["sighting_count"] == 1
    with engine.connect() as conn:
        linked = conn.execute(
            text("SELECT related_defect_id FROM defect_history WHERE defect_id = :id AND status = 'detected'"),
            {"id": new_id},
        ).scalar_one()
    assert linked == rejected_id
    # The link is not exposed in any response.
    detail = client.get(f"/defects/{new_id}").json()
    assert all(set(h) == {"status", "at"} for h in detail["history"])
    assert "rejected_defect_id" not in client.get("/reviews", params={"status": "answered"}).json()[0]


def test_day_boundary_uses_malaysia_time(client):
    sight(client, "r-0", at(13, 20))
    rejected_id = only_defect(client)["id"]
    client.post(f"/defects/{rejected_id}/reject")
    # 23:30 and 00:30 Malaysia time fall on the same UTC day but on two Malaysia days.
    sight(client, "r-1", at(13, 23, 30), east_m=2)
    sight(client, "r-2", at(14, 0, 30), east_m=2)
    assert [r["sighting"]["client_id"] for r in client.get("/reviews").json()] == ["r-1", "r-2"]


def test_not_defect_on_rejected_spot_changes_nothing(client, engine):
    rejected_id = reject_spot(client)
    sight(client, "r-1", at(14, 11), east_m=3)
    review_id = client.get("/reviews").json()[0]["id"]
    history_before = count(engine, "defect_history")
    assert client.post(f"/reviews/{review_id}", json={"answer": "not_defect"}).status_code == 200
    defect = only_defect(client)
    assert defect["id"] == rejected_id and defect["status"] == "rejected"
    assert count(engine, "defect_history") == history_before
    with engine.connect() as conn:
        assert conn.execute(
            text("SELECT negative_example FROM sightings WHERE client_id = 'r-1'")
        ).scalar_one() is True


def test_open_defect_beside_rejected_gives_review_band_a_normal_review(client, engine):
    sight(client, "r-1", at(14, 9))
    sight(client, "r-2", at(14, 9, 1), east_m=10)
    by_lon = sorted(defects(client), key=lambda d: d["lon"])
    client.post(f"/defects/{by_lon[0]['id']}/reject")
    sight(client, "r-3", at(14, 11), east_m=5, band="review", confidence=0.5)  # 5 m from both
    with engine.connect() as conn:
        rejected_link = conn.execute(
            text("SELECT rejected_defect_id FROM reviews")
        ).scalar_one()
    assert rejected_link is None  # the open defect is the live record, so this is a normal review
