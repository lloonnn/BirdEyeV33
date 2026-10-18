"""A plain tool loop: ask Gemini, run the tools it calls, return the results, repeat (decision 92)."""

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy import Connection, Engine, text

from bird_eye import clock
from bird_eye.agents.errors import ToolError
from bird_eye.agents.messages import ToolResult
from bird_eye.settings import Settings


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema
    fn: Callable[[Connection, dict[str, Any], int], dict[str, Any]]  # (conn, args, run_id) -> result
    final: bool = False  # the run ends when this tool succeeds


@dataclass
class RunResult:
    run_id: int
    outcome: str  # ok, step_limit or error
    steps: int
    error: str | None = None


class Model(Protocol):
    def send(self, message: Any) -> list[Any]: ...


def _log_call(engine: Engine, run_id: int, step: int, tool: str, args: dict, result: dict) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO agent_tool_calls (run_id, step, tool, args, result) "
                "VALUES (:run, :step, :tool, CAST(:args AS jsonb), CAST(:result AS jsonb))"
            ),
            {"run": run_id, "step": step, "tool": tool, "args": json.dumps(args, default=str),
             "result": json.dumps(result, default=str)},
        )


def _finish(engine: Engine, run_id: int, steps: int, outcome: str, error: str | None) -> RunResult:
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE agent_runs SET finished_at = :now, steps = :steps, outcome = :outcome, error = :error "
                 "WHERE id = :id"),
            {"now": clock.now(), "steps": steps, "outcome": outcome, "error": error, "id": run_id},
        )
    return RunResult(run_id, outcome, steps, error)


def run(
    engine: Engine,
    settings: Settings,
    agent_name: str,
    goal: str,
    system: str,
    tools: list[Tool],
    *,
    make_model: Callable[[Settings, str, list[dict[str, Any]]], Model] | None = None,
    run_id_out: list[int] | None = None,
) -> RunResult:
    """Run one agent. Never raises: a missing key or a Gemini error ends the run with outcome error."""
    with engine.begin() as conn:
        run_id = conn.execute(
            text("INSERT INTO agent_runs (agent, started_at) VALUES (:agent, :now) RETURNING id"),
            {"agent": agent_name, "now": clock.now()},
        ).scalar_one()
    by_name = {t.name: t for t in tools}
    steps = 0
    try:
        if make_model is None:
            from bird_eye.agents.gemini import make_model  # imports google-genai only now
        declarations = [{"name": t.name, "description": t.description, "parameters": t.parameters} for t in tools]
        model = make_model(settings, system, declarations)
        message: Any = goal
        while steps < settings.agent_max_steps:
            steps += 1
            calls = model.send(message)
            if not calls:
                return _finish(engine, run_id, steps, "error", "the model stopped without calling the final tool")
            results = []
            finished = False
            for call in calls:
                tool = by_name.get(call.name)
                if tool is None:
                    result: dict[str, Any] = {"error": f"unknown tool {call.name}"}
                else:
                    try:
                        with engine.begin() as conn:
                            result = tool.fn(conn, call.args, run_id)
                        finished = finished or tool.final
                    except ToolError as exc:
                        result = {"error": str(exc)}
                _log_call(engine, run_id, steps, call.name, call.args, result)
                results.append(ToolResult(call.name, result))
            if finished:
                return _finish(engine, run_id, steps, "ok", None)
            message = results
        return _finish(engine, run_id, steps, "step_limit", f"no final tool call in {steps} steps")
    except Exception as exc:  # noqa: BLE001 - Gemini, network and key errors must not escape a run
        return _finish(engine, run_id, steps, "error", f"{type(exc).__name__}: {exc}")

