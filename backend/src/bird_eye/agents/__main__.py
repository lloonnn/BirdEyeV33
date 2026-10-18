"""uv run python -m bird_eye.agents work-order | brief"""

import sys

from bird_eye.agents import service
from bird_eye.db import make_engine
from bird_eye.settings import get_settings


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in service.GOALS:
        print("usage: python -m bird_eye.agents work-order|brief", file=sys.stderr)
        return 2
    settings = get_settings()
    result = service.run_agent(make_engine(settings.database_url), settings, sys.argv[1])
    print(f"run: {result.run_id}")
    print(f"outcome: {result.outcome}")
    if result.error:
        print(f"error: {result.error}")
    return 0 if result.outcome == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
