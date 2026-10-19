from fastapi.testclient import TestClient

from bird_eye.main import create_app
from tests.conftest import at, defects, move_defect, only_defect, sight, verified_defect


def fixed_defect(client, engine) -> int:
    defect_id = verified_defect(client, "c-1")
    move_defect(engine, defect_id, "scheduled", "fixed")
    return defect_id


def clean(client, defect_id: int, when: str):
    return client.post(f"/dev/defects/{defect_id}/clean-pass", json={"at": when})


def test_clean_passes_one_day_do_not_confirm(client, engine):
    defect_id = fixed_defect(client, engine)
    for hh in (9, 11, 13):
        body = clean(client, defect_id, at(14, hh)).json()
    assert body["clean_passes"] == 3
    assert body["clean_days"] == 1
    assert body["defect"]["status"] == "fixed"


def test_clean_passes_two_days_confirm(client, engine):
    defect_id = fixed_defect(client, engine)
    statuses = [clean(client, defect_id, at(d, hh)).json()["defect"]["status"] for d, hh in ((14, 9), (14, 11), (15, 9))]
    assert statuses == ["fixed", "fixed", "confirmed"]
    defect = only_defect(client)
    assert defect["confirmed_at"] is not None
    detail = client.get(f"/defects/{defect_id}").json()
    assert detail["history"][-1]["status"] == "confirmed"


def test_clean_passes_within_hour_count_once(client, engine):
    defect_id = fixed_defect(client, engine)
    clean(client, defect_id, at(14, 9, 0))
    clean(client, defect_id, at(14, 9, 20))
    body = clean(client, defect_id, at(15, 9, 0)).json()
    assert body["clean_passes"] == 2
    assert body["defect"]["status"] == "fixed"


def test_clean_pass_on_non_fixed_defect_409(client):
    defect_id = verified_defect(client, "c-1")
    assert clean(client, defect_id, at(14, 9)).status_code == 409
    assert clean(client, 999, at(14, 9)).status_code == 404


def test_clean_pass_far_in_future_422(client, engine):
    defect_id = fixed_defect(client, engine)
    assert clean(client, defect_id, at(15, 10, 30)).status_code == 422
    assert clean(client, defect_id, at(15, 10, 4)).status_code == 200


def test_dev_routes_404_when_flag_off(settings):
    off = create_app(settings.model_copy(update={"dev_endpoints_enabled": False}))
    try:
        with TestClient(off) as c:
            assert c.post("/dev/defects/1/clean-pass", json={"at": at(14, 9)}).status_code == 404
            assert c.post("/dev/work-orders", json={}).status_code == 404
    finally:
        off.state.engine.dispose()


def test_reopen_clears_clean_passes(client, engine):
    defect_id = fixed_defect(client, engine)
    for d, hh in ((14, 9), (14, 11)):
        clean(client, defect_id, at(d, hh))
    # A sighting after the fix reopens the defect (cycle 2); old clean passes must not carry over.
    sight(client, "c-2", "2026-10-15T10:03:00+08:00")
    assert only_defect(client)["status"] == "detected"
    move_defect(engine, defect_id, "verified", "scheduled", "fixed")
    body = clean(client, defect_id, at(15, 10, 2)).json()
    assert body["clean_passes"] == 1
    assert body["defect"]["status"] == "fixed"
    assert len(defects(client)) == 1
