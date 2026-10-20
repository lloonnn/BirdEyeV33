from bird_eye.main import create_app
from fastapi.testclient import TestClient

from tests.conftest import draft, move_defect, verified_defect

WORK_ORDER_KEYS = {"id", "status", "crew_type", "description", "defect_ids", "created_at", "approved_at"}


def test_verified_to_fixed_through_approve_and_done(client):
    defect_id = verified_defect(client, "w-1")
    wo = draft(client, defect_id)
    assert set(wo) == WORK_ORDER_KEYS
    assert wo["status"] == "pending_approval" and wo["approved_at"] is None
    assert wo["defect_ids"] == [defect_id]
    assert client.get(f"/defects/{defect_id}").json()["work_order_id"] is None  # a draft is not a job

    approved = client.post(f"/work-orders/{wo['id']}/approve")
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved" and approved.json()["approved_at"] is not None
    scheduled = client.get(f"/defects/{defect_id}").json()
    assert scheduled["status"] == "scheduled" and scheduled["work_order_id"] == wo["id"]

    finished = client.post(f"/work-orders/{wo['id']}/done")
    assert finished.status_code == 200 and finished.json()["status"] == "done"
    fixed = client.get(f"/defects/{defect_id}").json()
    assert fixed["status"] == "fixed" and fixed["work_order_id"] == wo["id"]
    assert [h["status"] for h in fixed["history"]] == ["detected", "verified", "scheduled", "fixed"]


def test_reject_leaves_defects_verified(client):
    defect_id = verified_defect(client, "w-1")
    wo = draft(client, defect_id)
    rejected = client.post(f"/work-orders/{wo['id']}/reject")
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    defect = client.get(f"/defects/{defect_id}").json()
    assert defect["status"] == "verified" and defect["work_order_id"] is None
    assert client.post(f"/work-orders/{wo['id']}/approve").status_code == 409


def test_done_from_pending_returns_409(client):
    wo = draft(client, verified_defect(client, "w-1"))
    response = client.post(f"/work-orders/{wo['id']}/done")
    assert response.status_code == 409 and isinstance(response.json()["detail"], str)


def test_approve_twice_returns_409(client):
    wo = draft(client, verified_defect(client, "w-1"))
    assert client.post(f"/work-orders/{wo['id']}/approve").status_code == 200
    assert client.post(f"/work-orders/{wo['id']}/approve").status_code == 409
    assert client.post(f"/work-orders/{wo['id']}/reject").status_code == 409


def test_patch_add_defect_422(client):
    first = verified_defect(client, "w-1")
    other = verified_defect(client, "w-2", north_m=50)
    wo = draft(client, first)
    response = client.patch(f"/work-orders/{wo['id']}", json={"defect_ids": [first, other]})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert client.get(f"/work-orders/{wo['id']}").json()["defect_ids"] == [first]


def test_patch_remove_all_defects_409(client):
    wo = draft(client, verified_defect(client, "w-1"))
    response = client.patch(f"/work-orders/{wo['id']}", json={"defect_ids": []})
    assert response.status_code == 409
    assert len(client.get(f"/work-orders/{wo['id']}").json()["defect_ids"]) == 1


def test_patch_after_approve_409(client):
    wo = draft(client, verified_defect(client, "w-1"))
    client.post(f"/work-orders/{wo['id']}/approve")
    assert client.patch(f"/work-orders/{wo['id']}", json={"description": "late edit"}).status_code == 409


def test_patch_edits_text_and_removes_a_defect(client):
    first = verified_defect(client, "w-1")
    second = verified_defect(client, "w-2", north_m=50)
    wo = draft(client, first, second)
    assert wo["defect_ids"] == [first, second]
    patched = client.patch(
        f"/work-orders/{wo['id']}",
        json={"description": "Patch one", "crew_type": "sealing", "defect_ids": [second]},
    ).json()
    assert patched["description"] == "Patch one" and patched["crew_type"] == "sealing"
    assert patched["defect_ids"] == [second]
    only_text = client.patch(f"/work-orders/{wo['id']}", json={"description": "Again"}).json()
    assert only_text["defect_ids"] == [second] and only_text["crew_type"] == "sealing"  # left out: unchanged


def test_approve_with_a_defect_not_verified_409_and_changes_nothing(client, engine):
    first = verified_defect(client, "w-1")
    second = verified_defect(client, "w-2", north_m=50)
    wo = draft(client, first, second)
    move_defect(engine, second, "scheduled")  # some other path moved it on
    response = client.post(f"/work-orders/{wo['id']}/approve")
    assert response.status_code == 409 and str(second) in response.json()["detail"]
    assert client.get(f"/defects/{first}").json()["status"] == "verified"
    assert client.get(f"/work-orders/{wo['id']}").json()["status"] == "pending_approval"


def test_list_and_get_work_orders(client):
    first = draft(client, verified_defect(client, "w-1"))
    second = draft(client, verified_defect(client, "w-2", north_m=50))
    client.post(f"/work-orders/{second['id']}/approve")
    assert [w["id"] for w in client.get("/work-orders").json()] == [first["id"], second["id"]]
    assert [w["id"] for w in client.get("/work-orders", params={"status": "approved"}).json()] == [second["id"]]
    assert client.get("/work-orders", params={"status": "open"}).status_code == 422
    assert client.get(f"/work-orders/{first['id']}").json()["id"] == first["id"]
    assert client.get("/work-orders/999999").status_code == 404
    for action in ("approve", "reject", "done"):
        assert client.post(f"/work-orders/999999/{action}").status_code == 404
    assert client.patch("/work-orders/999999", json={}).status_code == 404


def test_dev_create_needs_existing_verified_defects_422(client):
    detected_only = verified_defect(client, "w-1")
    client.post(f"/work-orders/{draft(client, detected_only)['id']}/approve")  # now scheduled
    body = {"crew_type": "patching", "description": "x"}
    assert client.post("/dev/work-orders", json={**body, "defect_ids": [detected_only]}).status_code == 422
    assert client.post("/dev/work-orders", json={**body, "defect_ids": [999999]}).status_code == 422
    assert client.post("/dev/work-orders", json={**body, "defect_ids": []}).status_code == 422


def test_dev_route_404_when_flag_off(app, settings):
    off = create_app(settings.model_copy(update={"dev_endpoints_enabled": False}))
    try:
        response = TestClient(off).post(
            "/dev/work-orders", json={"defect_ids": [1], "crew_type": "x", "description": "x"}
        )
        assert response.status_code == 404
    finally:
        off.state.engine.dispose()
