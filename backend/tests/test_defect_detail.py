from tests.conftest import at, only_defect, sight

DEFECT_KEYS = {
    "id", "type", "status", "urgency", "urgency_band", "urgency_terms", "lat", "lon", "first_seen",
    "last_seen", "sighting_count", "crop_url", "segment_id", "work_order_id", "confirmed_at", "location_reasons",
}


def test_detail_has_sightings_and_history(client):
    sight(client, "d-1", at(14, 9), device_id="car-01")
    sight(client, "d-2", at(14, 9, 30), north_m=2, device_id="car-02", confidence=0.88)
    defect_id = only_defect(client)["id"]
    client.post(f"/defects/{defect_id}/verify")
    detail = client.get(f"/defects/{defect_id}").json()

    assert set(detail) == DEFECT_KEYS | {"sightings", "history"}
    assert [s["device_id"] for s in detail["sightings"]] == ["car-02", "car-01"]  # newest first
    assert set(detail["sightings"][0]) == {"id", "captured_at", "confidence", "crop_url", "device_id"}
    assert detail["sightings"][0]["crop_url"] == "/crops/d-2.jpg"
    assert detail["sightings"][0]["captured_at"] == at(14, 9, 30)
    assert [h["status"] for h in detail["history"]] == ["detected", "verified"]
    assert detail["history"][0]["at"] == at(14, 9)
    assert set(detail["history"][0]) == {"status", "at"}
