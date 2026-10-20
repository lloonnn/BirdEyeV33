"""Drive one invented defect through its whole lifecycle using the public API and /dev.

    uv run python scripts/scenario.py [--base-url http://localhost:8000]

The server must run with BIRDEYE_DEV_ENDPOINTS_ENABLED=true. INVENTED DATA: a made-up pothole near the
invented school point, from device scenario-car-01. First run (no defect at the spot): three drives
verify it, then it is fixed and confirmed. Second run (a confirmed defect there): a new sighting
reopens it, and the same path runs again. Reset with scripts/reset_dev_data.py --yes.
"""

import argparse
import json
import math
import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

MYT = ZoneInfo("Asia/Kuala_Lumpur")
CROP = Path(__file__).resolve().parent.parent / "tests" / "data" / "crop.jpg"
# Invented spot about 85 m from the invented school point, over 200 m from every seed defect.
SPOT_LAT, SPOT_LON = 3.186634, 101.515790
DEVICE = "scenario-car-01"


def jittered(max_m: float = 3.0) -> dict[str, float]:
    radius, angle = random.uniform(0, max_m), random.uniform(0, 2 * math.pi)
    return {
        "lat": SPOT_LAT + radius * math.sin(angle) / 111_320,
        "lon": SPOT_LON + radius * math.cos(angle) / (111_320 * math.cos(math.radians(SPOT_LAT))),
    }


def record(captured_at: datetime) -> dict:
    point = jittered()
    return {
        "client_id": f"scenario-{uuid.uuid4().hex[:12]}",
        "device_id": DEVICE,
        "captured_at": captured_at.isoformat(),
        "defect_type": "pothole",
        "confidence": 0.9,
        "band": "save",
        "bbox": [0.40, 0.50, 0.55, 0.68],
        "vehicle": {**point, "gps_accuracy_m": 4.0, "heading_deg": 90, "speed_kmh": 30},
        "distance_ahead_m": 12.0,
        "defect_point": point,
        "model_version": "scenario",
        "urgent": False,
        "crop_file": "crop.jpg",
    }


class Scenario:
    def __init__(self, http: httpx.Client) -> None:
        self.http = http
        self.defect_id: int | None = None

    def call(self, method: str, path: str, **kwargs) -> dict | list:
        response = self.http.request(method, path, **kwargs)
        if response.status_code >= 400:
            sys.exit(f"{method} {path} failed: {response.status_code} {response.text}")
        return response.json()

    def status(self) -> str:
        return self.call("GET", f"/defects/{self.defect_id}")["status"]

    def line(self, label: str, extra: str = "") -> str:
        status = self.status()
        print(f"{label:<16} defect {self.defect_id}  {status:<8}{('   ' + extra) if extra else ''}".rstrip())
        return status

    def drive(self, captured_at: datetime) -> None:
        files = [("crop.jpg", ("crop.jpg", CROP.read_bytes(), "image/jpeg"))]
        self.call("POST", "/detections/batch", data={"records": json.dumps([record(captured_at)])}, files=files)

    def find(self) -> dict | None:
        d = 0.0005  # about 55 m
        bbox = f"{SPOT_LON - d},{SPOT_LAT - d},{SPOT_LON + d},{SPOT_LAT + d}"
        found = self.call("GET", "/defects", params={"bbox": bbox})
        return found[0] if found else None

    def finish(self, day: datetime) -> None:
        """Work order, approve, done, and three clean passes on two later days."""
        work_order = self.call(
            "POST", "/dev/work-orders",
            json={"defect_ids": [self.defect_id], "crew_type": "patching", "description": "Scenario patch job"},
        )
        self.line("work order", f"(work order {work_order['id']} {work_order['status']})")
        self.call("POST", f"/work-orders/{work_order['id']}/approve")
        self.line("approve")
        self.call("POST", f"/work-orders/{work_order['id']}/done")
        self.line("done")
        for n, (offset_days, hour) in enumerate(((1, 9), (1, 11), (2, 9)), 1):
            when = (day + timedelta(days=offset_days)).replace(hour=hour)
            self.call("POST", f"/dev/defects/{self.defect_id}/clean-pass", json={"at": when.isoformat()})
            self.line(f"clean pass {n}")
        history = self.call("GET", f"/defects/{self.defect_id}")["history"]
        print(f"history: {len(history)} entries")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    with httpx.Client(base_url=args.base_url, timeout=30) as http:
        s = Scenario(http)
        # D is the Malaysia calendar day 3 days ago, so every timestamp sent below is in the past.
        day = (datetime.now(MYT) - timedelta(days=3)).replace(hour=0, minute=0, second=0, microsecond=0)
        existing = s.find()
        if existing is None:
            for n, (hh, mm) in enumerate(((9, 0), (10, 5), (11, 10)), 1):
                s.drive(day.replace(hour=hh, minute=mm))
                if s.defect_id is None:
                    s.defect_id = s.find()["id"]
                s.line(f"drive {n}")
        elif existing["status"] == "confirmed":
            s.defect_id = existing["id"]
            s.drive(datetime.now(MYT))
            s.line("reopen drive", "reopened" if s.status() == "detected" else "NOT reopened")
            s.call("POST", f"/defects/{s.defect_id}/verify")
            s.line("verify")
        else:
            sys.exit(f"Defect {existing['id']} at the spot is {existing['status']}; reset first.")
        s.finish(day)
        reasons = s.call("GET", f"/defects/{s.defect_id}")
        print(f"final status: {reasons['status']}  location_reasons: {reasons['location_reasons']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
