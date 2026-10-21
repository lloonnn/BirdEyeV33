"""Send a folder written by scripts/export_data.py to a backend through POST /detections/batch.

    uv run python scripts/import_data.py <folder> http://localhost:8000

Records go in batches, oldest first, so the backend merges them as it would live uploads. The backend
skips a client_id it already holds, so running this twice stores nothing new. Review answers in
reviews.json are not replayed: the contract has no way to answer a review by client_id, and new
review-band records queue fresh reviews instead.
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

# Mirrors BIRDEYE_MAX_RECORDS_PER_BATCH; the backend refuses larger batches. Starting value, to be tuned.
DEFAULT_BATCH_SIZE = 200


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("folder", type=Path, help="folder written by export_data.py")
    parser.add_argument("url", help="backend base URL, for example http://localhost:8000")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    args = parser.parse_args()

    records = json.loads((args.folder / "records.json").read_text())
    crops_dir = args.folder / "crops"
    endpoint = f"{args.url.rstrip('/')}/detections/batch"
    accepted = duplicates = 0
    with httpx.Client(timeout=120) as client:
        for start in range(0, len(records), args.batch_size):
            batch = records[start : start + args.batch_size]
            # The part name is the record's crop_file. The export names crops by client_id, which is
            # unique, so each record is sent with crop_file set to that name.
            sent = [{**r, "crop_file": f"{r['client_id']}.jpg"} for r in batch]
            files = [
                (r["crop_file"], (r["crop_file"], (crops_dir / r["crop_file"]).read_bytes(), "image/jpeg"))
                for r in sent
            ]
            res = client.post(endpoint, data={"records": json.dumps(sent)}, files=files)
            if res.status_code != 200:
                print(f"Batch from record {start} failed with {res.status_code}: {res.text[:500]}", file=sys.stderr)
                print(f"Stopped. Before it: {accepted} accepted, {duplicates} duplicates.", file=sys.stderr)
                return 1
            result = res.json()
            accepted += result["accepted"]
            duplicates += result["duplicates"]
    print(f"Imported {len(records)} records to {args.url}: {accepted} accepted, {duplicates} duplicates skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
