"""Urgency score: a weighted sum of four terms, each from 0 to 1 (architecture.md section 5).

Type, size and location are stored on the defect. Age changes with the clock, so it and the
total are computed in SQL on every read; no scheduled job is needed.
"""

from datetime import datetime

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
