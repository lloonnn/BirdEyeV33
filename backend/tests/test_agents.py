"""Agents run against a scripted fake model. No test reaches the real Gemini."""

import pytest
from sqlalchemy import text

from bird_eye.agents import service
from bird_eye.agents.messages import Call
from tests.conftest import count, draft, verified_defect


class FakeModel:
    """Answers each `send` with the next scripted list of tool calls and records what it was sent."""

    def __init__(self, *turns: list[Call]) -> None:
        self.turns = list(turns)
        self.sent: list = []

    def send(self, message):
        self.sent.append(message)
        return self.turns.pop(0) if self.turns else [Call("get_defects", {})]


def run(app, agent: str, model: FakeModel, **settings_update):
    settings = app.state.settings.model_copy(update=settings_update)
    return service.run_agent(app.state.engine, settings, agent, make_model=lambda *_: model)


def draft_call(ids, **extra):
    return Call("create_work_order_draft", {"defect_ids": ids, "crew_type": "patching", "description": "Patch", **extra})


def test_work_order_agent_creates_pending_draft(client, app):
    a = verified_defect(client, "a-1")
    b = verified_defect(client, "a-2", north_m=50)
    model = FakeModel([Call("get_defects", {})], [Call("group_nearby", {"defect_ids": [a, b]})], [draft_call([a, b])], [])
    result = run(app, "work-order", model)
    assert result.outcome == "ok"
    assert result.steps == 4  # the model stopped by itself after saving its draft
    orders = client.get("/work-orders", params={"status": "pending_approval"}).json()
    assert [o["defect_ids"] for o in orders] == [[a, b]]
    # the agent changed no defect status
    assert {d["status"] for d in client.get("/defects", params={"bbox": "101,3,102,4"}).json()} == {"verified"}
    with app.state.engine.connect() as conn:
        run_id = conn.execute(text("SELECT agent_run_id FROM work_orders")).scalar_one()
    assert run_id == result.run_id


def test_get_defects_skips_defects_already_on_a_draft(client, app):
    a = verified_defect(client, "a-1")
    b = verified_defect(client, "a-2", north_m=50)
    draft(client, a)
    model = FakeModel([Call("get_defects", {})], [draft_call([b])])
    run(app, "work-order", model)
    listed = model.sent[1][0].result["defects"]
    assert [d["id"] for d in listed] == [b]


def test_draft_with_unknown_defect_id_rejected(client, app):
    a = verified_defect(client, "a-1")
    model = FakeModel([draft_call([a, 9999])], [draft_call([a])], [])
    result = run(app, "work-order", model)
    assert "not found" in model.sent[1][0].result["error"]
    assert result.outcome == "ok"  # the model corrected itself
    assert count(app.state.engine, "work_orders") == 1


def test_draft_with_unverified_defect_rejected(client, app):
    from tests.conftest import at, defects, sight

    sight(client, "a-1", at(14, 9))
    detected = defects(client)[0]["id"]
    model = FakeModel([draft_call([detected])])
    result = run(app, "work-order", model, agent_max_steps=1)
    assert result.outcome == "step_limit"
    assert count(app.state.engine, "work_orders") == 0
    with app.state.engine.connect() as conn:
        logged = conn.execute(text("SELECT result FROM agent_tool_calls WHERE run_id = :i"), {"i": result.run_id}).scalar_one()
    assert "verified" in logged["error"]


def test_brief_citing_unlisted_id_rejected(client, app):
    a = verified_defect(client, "a-1")
    b = verified_defect(client, "a-2", north_m=50)
    bad = Call("post_brief", {"text": f"Fix #{a} and #{b} first.", "defect_ids": [a]})
    good = Call("post_brief", {"text": f"Fix #{a} first.", "defect_ids": [a]})
    model = FakeModel([bad], [good], [])
    result = run(app, "brief", model)
    assert str(b) in model.sent[1][0].result["error"]
    assert result.outcome == "ok"
    assert count(app.state.engine, "briefs") == 1
    assert client.get("/brief/latest").json()["defect_ids"] == [a]


def test_brief_unknown_defect_id_rejected(client, app):
    model = FakeModel([Call("post_brief", {"text": "See #77", "defect_ids": [77]})])
    result = run(app, "brief", model, agent_max_steps=1)
    assert result.outcome == "step_limit"
    assert count(app.state.engine, "briefs") == 0


def test_step_limit_stops_loop(client, app):
    verified_defect(client, "a-1")
    model = FakeModel()  # calls get_defects forever
    result = run(app, "work-order", model, agent_max_steps=3)
    assert result.outcome == "step_limit"
    assert result.steps == 3
    assert len(model.sent) == 3
    assert count(app.state.engine, "work_orders") == 0


def test_run_logged_with_tool_calls(client, app):
    a = verified_defect(client, "a-1")
    result = run(app, "work-order", FakeModel([Call("get_defects", {})], [draft_call([a])], []))
    with app.state.engine.connect() as conn:
        run_row = conn.execute(text("SELECT agent, outcome, steps FROM agent_runs WHERE id = :i"), {"i": result.run_id}).one()
        calls = conn.execute(
            text("SELECT step, tool, result FROM agent_tool_calls WHERE run_id = :i ORDER BY step"), {"i": result.run_id}
        ).all()
    assert tuple(run_row) == ("work-order", "ok", 3)
    assert [(c[0], c[1]) for c in calls] == [(1, "get_defects"), (2, "create_work_order_draft")]
    assert calls[1][2]["status"] == "pending_approval"


def test_brief_latest_404_when_none(client):
    assert client.get("/brief/latest").status_code == 404


def test_brief_latest_returns_newest(client, app):
    a = verified_defect(client, "a-1")
    run(app, "brief", FakeModel([Call("post_brief", {"text": f"One #{a}", "defect_ids": [a]})]))
    run(app, "brief", FakeModel([Call("post_brief", {"text": "Two", "defect_ids": []})]))
    body = client.get("/brief/latest").json()
    assert body["text"] == "Two"
    assert set(body) == {"id", "created_at", "text", "defect_ids"}


def test_model_error_ends_run_with_error(client, app):
    class Boom:
        def send(self, message):
            raise RuntimeError("quota exceeded")

    result = service.run_agent(app.state.engine, app.state.settings, "brief", make_model=lambda *_: Boom())
    assert result.outcome == "error"
    assert "quota exceeded" in result.error


def test_endpoints_work_without_api_key(client, app):
    verified_defect(client, "a-1")
    assert app.state.settings.gemini_api_key is None
    for agent in ("brief", "work-order"):
        body = client.post(f"/dev/agents/{agent}").json()
        assert body["outcome"] == "error"
        assert "GEMINI_API_KEY" in body["error"]
    assert client.get("/defects", params={"bbox": "101,3,102,4"}).status_code == 200
    assert client.get("/work-orders").status_code == 200
    assert client.get("/brief/latest").status_code == 404
    assert client.get("/reviews").status_code == 200


def test_agents_have_no_status_changing_tool(app):
    from bird_eye.agents.tools import make_tools

    for agent in ("work-order", "brief"):
        names = {t.name for t in make_tools(app.state.settings, app.state.storage, agent)}
        assert not names & {"verify", "approve", "done", "set_status", "send"}


def test_final_tool_does_not_end_the_run_one_draft_per_group(client, app):
    a = verified_defect(client, "a-1")
    b = verified_defect(client, "a-2", north_m=500)  # far from a: a second group
    model = FakeModel([Call("get_defects", {})], [draft_call([a])], [draft_call([b])], [])
    result = run(app, "work-order", model)
    assert result.outcome == "ok"
    assert result.steps == 4
    orders = client.get("/work-orders", params={"status": "pending_approval"}).json()
    assert sorted(o["defect_ids"] for o in orders) == [[a], [b]]


def test_model_stops_without_saving_anything_is_an_error(client, app):
    verified_defect(client, "a-1")
    result = run(app, "work-order", FakeModel([Call("get_defects", {})], []))
    assert result.outcome == "error"
    assert "final tool" in result.error
    assert count(app.state.engine, "work_orders") == 0


def test_step_limit_after_a_saved_draft_is_ok(client, app):
    a = verified_defect(client, "a-1")
    result = run(app, "work-order", FakeModel([draft_call([a])]), agent_max_steps=3)  # then get_defects forever
    assert result.outcome == "ok"
    assert result.steps == 3
    assert count(app.state.engine, "work_orders") == 1


def test_since_without_offset_is_malaysia_time(client, app, monkeypatch):
    from datetime import UTC, datetime

    from bird_eye import clock
    from tests.conftest import at, sight

    # The real clock returns UTC; the test clock is frozen in Malaysia time, which would hide the bug.
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 10, 15, 2, 0, tzinfo=UTC))
    sight(client, "a-1", at(14, 6))  # 06:00 Malaysia time is 22:00 UTC on the 13th
    defect_id = client.get("/defects", params={"bbox": "101,3,102,4"}).json()[0]["id"]
    client.post(f"/defects/{defect_id}/verify")
    model = FakeModel([Call("get_defects", {"since": "2026-10-14"})], [Call("get_defects", {"since": "2026-10-14T07:00"})])
    run(app, "work-order", model, agent_max_steps=3)
    assert [d["id"] for d in model.sent[1][0].result["defects"]] == [defect_id]  # from 00:00 Malaysia time
    assert model.sent[2][0].result["defects"] == []  # 07:00 is after the sighting
