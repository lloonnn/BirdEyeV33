"""Urgency score: a weighted sum of four terms, each from 0 to 1 (architecture.md section 5).

Type, size and location are stored on the defect. Age changes with the clock, so it and the
total are computed in SQL on every read; no scheduled job is needed.
"""

import math
import tomllib
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from bird_eye.settings import Settings

# SQL expressions over a `defects` row aliased `d`. Bind :now and the weight parameters.
AGE_TERM_SQL = (
    "LEAST(1.0, GREATEST(0.0, "
    "EXTRACT(EPOCH FROM (CAST(:now AS timestamptz) - d.first_seen))::float8 / 86400.0 / :age_full_days))"
)

URGENCY_SQL = (
    f"((:w_type * d.type_term + :w_size * d.size_term + :w_location * d.location_term"
    f" + :w_age * {AGE_TERM_SQL}) / (:w_type + :w_size + :w_location + :w_age))"
)


def urgency_params(settings: Settings, now: datetime) -> dict[str, object]:
    return {
        "now": now,
        "age_full_days": settings.age_full_days,
        "w_type": settings.weight_type,
        "w_size": settings.weight_size,
        "w_location": settings.weight_location,
        "w_age": settings.weight_age,
    }


def band(urgency: float, settings: Settings) -> str:
    if urgency >= settings.band_high_min:
        return "high"
    if urgency >= settings.band_medium_min:
        return "medium"
    return "low"


# Stored terms, recomputed whenever a sighting joins or a defect is created.

LOCATION_KINDS = ("school", "main_road", "junction")


def size_term(largest_area: float | None, settings: Settings) -> float:
    """Box area as a share of the frame, scaled by size_area_max and capped at 1.

    Known limit: the same pothole looks smaller from further away, so this is a rough signal.
    """
    if not largest_area or largest_area <= 0:
        return 0.0
    return min(largest_area / settings.size_area_max, 1.0)


@lru_cache
def _load_points(path: str) -> tuple[tuple[str, float, float], ...]:
    with open(Path(path), "rb") as f:
        data = tomllib.load(f)
    points = []
    for point in data.get("point", []):
        if point["kind"] not in LOCATION_KINDS:
            raise ValueError(f"unknown location kind in {path}: {point['kind']}")
        points.append((point["kind"], float(point["lat"]), float(point["lon"])))
    return tuple(points)


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance; accurate to well under a metre at these ranges."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(math.sqrt(h))


def location_term(lat: float, lon: float, settings: Settings) -> tuple[float, list[str]]:
    """1.0 if within the kind's radius of any invented point, else 0; plus the kinds matched."""
    radius = {
        "school": settings.location_radius_school_m,
        "main_road": settings.location_radius_main_road_m,
        "junction": settings.location_radius_junction_m,
    }
    matched = {
        kind
        for kind, p_lat, p_lon in _load_points(settings.location_points_file)
        if _distance_m(lat, lon, p_lat, p_lon) <= radius[kind]
    }
    reasons = [kind for kind in LOCATION_KINDS if kind in matched]
    return (1.0 if reasons else 0.0), reasons
