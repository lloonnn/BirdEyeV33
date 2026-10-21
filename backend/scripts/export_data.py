"""Write every sighting in the database to one folder: the original records, their crops and review answers.

    uv run python scripts/export_data.py <folder>

The folder holds:
  records.json  the detection records exactly as the phone sent them, oldest first;
  crops/        one crop per record, named <client_id>.jpg;
  reviews.json  one entry per review: client_id, status, answer, answer_class, answered_at.
Seed rows are exported too; their records say device seed-invented. Load the folder into another backend
with scripts/import_data.py.
"""

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import text

from bird_eye.db import make_engine
from bird_eye.settings import get_settings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("folder", type=Path, help="output folder; must be empty or not exist yet")
    args = parser.parse_args()
    if args.folder.exists() and any(args.folder.iterdir()):
        print(f"Refusing to write into {args.folder}: it is not empty.", file=sys.stderr)
        return 1

    settings = get_settings()
    engine = make_engine(settings.database_url)
    with engine.connect() as conn:
        sightings = conn.execute(
            text("SELECT client_id, record, crop_key FROM sightings ORDER BY captured_at, id")
        ).mappings().all()
        reviews = conn.execute(
            text(
                """
                SELECT s.client_id, r.status, r.answer, r.answer_class, r.answered_at
                FROM reviews r JOIN sightings s ON s.id = r.sighting_id
                ORDER BY r.id
                """
            )
        ).mappings().all()

    crops_dir = args.folder / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)
    # Crops are read straight from the local disk store (LocalDiskStorage), which keys them by crop_key.
    source = Path(settings.crop_dir)
    missing = []
    for s in sightings:
        crop = source / s["crop_key"]
        if crop.is_file():
            (crops_dir / f"{s['client_id']}.jpg").write_bytes(crop.read_bytes())
        else:
            missing.append(s["client_id"])

    (args.folder / "records.json").write_text(json.dumps([s["record"] for s in sightings], indent=1))
    (args.folder / "reviews.json").write_text(
        json.dumps(
            [{**r, "answered_at": r["answered_at"].isoformat() if r["answered_at"] else None} for r in reviews],
            indent=1,
        )
    )
    print(f"Exported {len(sightings)} records and {len(reviews)} reviews to {args.folder}.")
    if missing:
        print(f"WARNING: {len(missing)} crops missing from {source}: {', '.join(missing[:5])}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
