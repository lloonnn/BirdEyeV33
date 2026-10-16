"""Counting passes from sightings, without tracks (manager decision, 15 Oct).

In time order, the first sighting starts pass 1. A sighting starts a new pass when it is at least
`gap` after the first sighting of the current pass. Anchoring to the pass start stops sightings
50 minutes apart from chaining into one endless pass. The device is ignored.
"""

from collections.abc import Iterable
from datetime import datetime, timedelta


def count_passes(captured_at: Iterable[datetime], gap: timedelta) -> int:
    passes = 0
    pass_start: datetime | None = None
    for t in sorted(captured_at):
        if pass_start is None or t - pass_start >= gap:
            passes += 1
            pass_start = t
    return passes
