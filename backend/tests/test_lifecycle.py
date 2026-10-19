from datetime import datetime

from bird_eye import clock
from tests.conftest import MYT, at, only_defect, move_defect, sight


def test_reject_then_verify_returns_409(client):
    sight(client, "l-1", at(14, 9))
    defect_id = only_defect(client)["id"]
    rejected = client.post(f"/defects/{defect_id}/reject")
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    response = client.post(f"/defects/{defect_id}/verify")
    assert response.status_code == 409
    assert isinstance(response.json()["detail"], str)


def test_verify_unknown_id_returns_404(client):
    assert client.post("/defects/999999/verify").status_code == 404
    assert client.post("/defects/999999/reject").status_code == 404
    assert client.get("/defects/999999").status_code == 404


def test_supervisor_verify_moves_detected_at_once(client):
    sight(client, "l-1", at(14, 9))
    defect_id = only_defect(client)["id"]
    response = client.post(f"/defects/{defect_id}/verify")
    assert response.status_code == 200 and response.json()["status"] == "verified"
    assert client.post(f"/defects/{defect_id}/reject").status_code == 409


def test_detection_near_fixed_reopens_and_keeps_history(client, engine):
    sight(client, "l-1", at(15, 8))
    defect_id = only_defect(client)["id"]
    move_defect(engine, defect_id, "verified", "scheduled", "fixed")  # fixed at the frozen 10:00
    sight(client, "l-2", at(15, 10, 3), north_m=2)
    detail = client.get(f"/defects/{defect_id}").json()
    assert detail["status"] == "detected"
    assert detail["work_order_id"] is None
    assert [h["status"] for h in detail["history"]] == ["detected", "verified", "scheduled", "fixed", "detected"]
    assert len(detail["sightings"]) == 2


def test_sighting_older_than_fix_does_not_reopen(client, engine):
    sight(client, "l-1", at(15, 8))
    defect_id = only_defect(client)["id"]
    move_defect(engine, defect_id, "verified", "scheduled", "fixed")  # fixed at the frozen 10:00
    sight(client, "l-2", at(15, 9, 30), north_m=2)  # a late batch from before the repair
    defect = only_defect(client)
    assert defect["status"] == "fixed"
    assert defect["sighting_count"] == 2


def test_passes_after_reopen_count_from_reopen(client, engine, monkeypatch):
    for i, (hh, mm) in enumerate([(9, 0), (10, 5), (11, 10)]):
        sight(client, f"old-{i}", at(14, hh, mm))
    defect_id = only_defect(client)["id"]
    assert only_defect(client)["status"] == "verified"
    move_defect(engine, defect_id, "scheduled", "fixed")  # fixed on 15 Oct 10:00
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 10, 16, 12, 0, tzinfo=MYT))
    sight(client, "new-1", at(16, 9, 0))
    sight(client, "new-2", at(16, 10, 5))
    # Five passes in all, but only two since the reopen.
    assert only_defect(client)["status"] == "detected"
    sight(client, "new-3", at(16, 11, 10))
    assert only_defect(client)["status"] == "verified"
