"""The agents' tools. Reads and drafts only: none changes a defect's status or sends anything out."""

import math
import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, text

from bird_eye import clock, work_orders
from bird_eye.agents.errors import ToolError
from bird_eye.agents.loop import Tool
from bird_eye.defects import list_defects
from bird_eye.errors import NotFoundError
from bird_eye.schemas import DEFECT_STATUSES
from bird_eye.settings import Settings
from bird_eye.storage import CropStorage

_WORLD = (-180.0, -90.0, 180.0, 90.0)
_CITED = re.compile(r"#(\d+)")


def _int_list(args: dict[str, Any], key: str) -> list[int]:
    raw = args.get(key)
    if not isinstance(raw, list) or not raw:
        raise ToolError(f"{key} must be a non-empty list of defect IDs")
    try:
        return sorted({int(v) for v in raw})
    except (TypeError, ValueError):
        raise ToolError(f"{key} must hold integers") from None


def _existing(conn: Connection, ids: list[int]) -> dict[int, str]:
    return dict(conn.execute(text("SELECT id, status FROM defects WHERE id = ANY(:ids)"), {"ids": ids}).all())


def _covered_by_open_work_order(conn: Connection, ids: list[int]) -> set[int]:
    rows = conn.execute(
        text(
            "SELECT DISTINCT wd.defect_id FROM work_order_defects wd JOIN work_orders w ON w.id = wd.work_order_id "
            "WHERE wd.defect_id = ANY(:ids) AND w.status IN ('pending_approval', 'approved')"
        ),
        {"ids": ids},
    )
    return {r[0] for r in rows}


def make_tools(settings: Settings, storage: CropStorage, agent: str) -> list[Tool]:
    def get_defects(conn: Connection, args: dict[str, Any], run_id: int) -> dict[str, Any]:
        status = args.get("status")
        if status is None and agent == "work-order":
            status = "verified"
        if status is not None and status not in DEFECT_STATUSES:
            raise ToolError(f"status must be one of {', '.join(DEFECT_STATUSES)}")
        since = None
        if args.get("since"):
            try:
                since = datetime.fromisoformat(str(args["since"]))
            except ValueError:
                raise ToolError("since must be an ISO date or time, for example 2026-10-12") from None
            if since.tzinfo is None:
                # A date or time without an offset is Malaysia time, like the last_seen it is compared with.
                since = since.replace(tzinfo=ZoneInfo(settings.local_timezone))
        found = list_defects(
            conn, settings, storage, bbox=_WORLD, defect_type=None,
            statuses=[status] if status else None, limit=settings.defects_limit_max,
        )
        if since is not None:
            found = [d for d in found if d.last_seen >= since]
        if agent == "work-order":
            covered = _covered_by_open_work_order(conn, [d.id for d in found]) if found else set()
            found = [d for d in found if d.id not in covered]
        rows = [
            {"id": d.id, "type": d.type, "status": d.status, "urgency": d.urgency, "band": d.urgency_band,
             "lat": d.lat, "lon": d.lon, "first_seen": d.first_seen.isoformat(), "last_seen": d.last_seen.isoformat(),
             "sighting_count": d.sighting_count, "location_reasons": d.location_reasons}
            for d in found[: settings.agent_defects_max]
        ]
        return {"defects": rows, "total_matching": len(found)}

    def group_nearby(conn: Connection, args: dict[str, Any], run_id: int) -> dict[str, Any]:
        ids = _int_list(args, "defect_ids")
        radius = float(args.get("radius_m") or settings.agent_group_radius_m)
        points = {
            r[0]: (r[1], r[2])
            for r in conn.execute(
                text("SELECT id, ST_Y(geog::geometry), ST_X(geog::geometry) FROM defects WHERE id = ANY(:ids)"),
                {"ids": ids},
            )
        }
        missing = [i for i in ids if i not in points]
        if missing:
            raise ToolError(f"defects not found: {missing}")

        def metres(a: int, b: int) -> float:
            (la, oa), (lb, ob) = points[a], points[b]
            return math.hypot((la - lb) * 111_320, (oa - ob) * 111_320 * math.cos(math.radians(la)))

        groups: list[list[int]] = []
        for i in ids:  # single linkage: a defect joins every group it is within `radius` of
            near = [g for g in groups if any(metres(i, j) <= radius for j in g)]
            merged = [i] + [j for g in near for j in g]
            groups = [g for g in groups if g not in near] + [sorted(merged)]
        return {"radius_m": radius, "groups": sorted(groups)}

    def create_work_order_draft(conn: Connection, args: dict[str, Any], run_id: int) -> dict[str, Any]:
        ids = _int_list(args, "defect_ids")
        crew_type, description = str(args.get("crew_type") or "").strip(), str(args.get("description") or "").strip()
        if not crew_type or not description:
            raise ToolError("crew_type and description are required")
        found = _existing(conn, ids)
        if [i for i in ids if i not in found]:
            raise ToolError(f"defects not found: {[i for i in ids if i not in found]}")
        not_verified = [f"{i} ({found[i]})" for i in ids if found[i] != "verified"]
        if not_verified:
            raise ToolError(f"every defect must be verified: {', '.join(not_verified)}")
        taken = sorted(_covered_by_open_work_order(conn, ids))
        if taken:
            raise ToolError(f"defects already on an open work order: {taken}")
        order = work_orders.create_draft(conn, settings, ids, crew_type, description, agent_run_id=run_id)
        return {"work_order_id": order.id, "status": order.status, "defect_ids": order.defect_ids}

    def post_brief(conn: Connection, args: dict[str, Any], run_id: int) -> dict[str, Any]:
        body = str(args.get("text") or "").strip()
        if not body:
            raise ToolError("text is required")
        ids = _int_list(args, "defect_ids") if args.get("defect_ids") else []
        known = _existing(conn, ids) if ids else {}
        missing = [i for i in ids if i not in known]
        if missing:
            raise ToolError(f"defects not found: {missing}")
        uncited = sorted({int(m) for m in _CITED.findall(body)} - set(ids))
        if uncited:
            raise ToolError(f"the text cites defects missing from defect_ids: {uncited}")
        brief_id = conn.execute(
            text("INSERT INTO briefs (created_at, text, agent_run_id) VALUES (:now, :text, :run) RETURNING id"),
            {"now": clock.now(), "text": body, "run": run_id},
        ).scalar_one()
        if ids:
            conn.execute(
                text("INSERT INTO brief_defects (brief_id, defect_id) VALUES (:b, :d)"),
                [{"b": brief_id, "d": i} for i in ids],
            )
        return {"brief_id": brief_id, "defect_ids": ids}

    status_enum = list(DEFECT_STATUSES)
    ids_schema = {"type": "array", "items": {"type": "integer"}}
    read = Tool(
        "get_defects",
        "List tracked defects, most urgent first. Read only.",
        {"type": "object", "properties": {
            "status": {"type": "string", "enum": status_enum},
            "since": {"type": "string", "description": "ISO date; only defects last seen on or after it"}}},
        get_defects,
    )
    if agent == "work-order":
        return [
            read,
            Tool("group_nearby", "Group defect IDs that lie close together, by distance only.",
                 {"type": "object", "properties": {"defect_ids": ids_schema, "radius_m": {"type": "number"}},
                  "required": ["defect_ids"]}, group_nearby),
            Tool("create_work_order_draft",
                 "Save a draft work order over verified defects. A supervisor approves it later.",
                 {"type": "object", "properties": {
                     "defect_ids": ids_schema, "crew_type": {"type": "string"}, "description": {"type": "string"}},
                  "required": ["defect_ids", "crew_type", "description"]}, create_work_order_draft, final=True),
        ]
    return [
        read,
        Tool("post_brief",
             "Save the daily brief. Cite a defect in the text as #ID and list every cited ID in defect_ids.",
             {"type": "object", "properties": {"text": {"type": "string"}, "defect_ids": ids_schema},
              "required": ["text", "defect_ids"]}, post_brief, final=True),
    ]
