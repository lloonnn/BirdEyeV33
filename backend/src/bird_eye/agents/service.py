"""Starting a run. Used by the command line and by POST /dev/agents/{agent}."""

from collections.abc import Callable
from typing import Any

from sqlalchemy import Engine

from bird_eye.agents import loop
from bird_eye.agents.tools import make_tools
from bird_eye.settings import Settings
from bird_eye.storage import LocalDiskStorage

WORK_ORDER_SYSTEM = (
    "You draft road repair work orders for a township. Use only the tools. Never invent defect IDs. "
    "A supervisor reviews every draft."
)
BRIEF_SYSTEM = (
    "You write a short daily brief on road defects for a township supervisor. Use only the tools. "
    "Cite each defect you mention as #ID and pass every cited ID in defect_ids. State only what the data shows."
)
GOALS = {
    "work-order": (
        "Get the verified defects that have no work order. Group those that lie close together and save "
        "one draft work order per group with create_work_order_draft, with a crew type and a short description. "
        "Save at least one draft if any defect is available."
    ),
    "brief": (
        "Get the defects (use get_defects, for example with since set to yesterday's date for new ones) and "
        "write a brief of a few short sentences: what is new, what is most urgent. Save it with post_brief."
    ),
}
SYSTEMS = {"work-order": WORK_ORDER_SYSTEM, "brief": BRIEF_SYSTEM}


def run_agent(
    engine: Engine,
    settings: Settings,
    agent: str,
    *,
    make_model: Callable[[Settings, str, list[dict[str, Any]]], Any] | None = None,
) -> loop.RunResult:
    storage = LocalDiskStorage(settings.crop_dir, settings.crop_url_prefix)
    return loop.run(
        engine, settings, agent, GOALS[agent], SYSTEMS[agent], make_tools(settings, storage, agent),
        make_model=make_model,
    )
