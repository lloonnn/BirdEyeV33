"""Empty the database and delete stored crops. Run before the demo.

    uv run python scripts/reset_dev_data.py --yes
"""

import argparse
import sys

from bird_eye.db import make_engine
from bird_eye.maintenance import reset_all
from bird_eye.settings import get_settings
from bird_eye.storage import LocalDiskStorage


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--yes", action="store_true", help="confirm that every row and crop is deleted")
    args = parser.parse_args()
    settings = get_settings()
    if not args.yes:
        print(f"Refusing to reset {settings.database_url} without --yes.", file=sys.stderr)
        return 1
    engine = make_engine(settings.database_url)
    defects, crops = reset_all(engine, LocalDiskStorage(settings.crop_dir, settings.crop_url_prefix))
    print(f"Reset: removed {defects} defects and {crops} crops.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
