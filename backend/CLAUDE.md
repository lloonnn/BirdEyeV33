# backend/CLAUDE.md

The Bird Eye v33 backend. It ingests detections, tracks and heartbeats from the eagle app, merges sightings into defects, runs the lifecycle, coverage and urgency jobs, runs the agents and serves the dashboard. Read `../docs/decisions.md`, sections 5 and 6 of `../docs/architecture.md`, and `../docs/api-contract.md` first.

## Stack

- Python 3.14 (`.python-version`), uv, `src/` layout, `uv_build` build backend.
- FastAPI for the API.
- PostgreSQL with PostGIS, run in Docker on the demo laptop. Crops go to local disk behind a storage interface. Merge uses `ST_DWithin`; the nightly clean-up uses `ST_ClusterDBSCAN`.
- APScheduler runs scheduled jobs and agent runs inside the backend process.
- Agents live in the package `bird_eye.agents`.

Current state: the package is still the uv template `backend` (`src/backend/__init__.py`, entry point `backend:main`) with no dependencies. The decided package name for agents is `bird_eye.agents`, so the package will need renaming to `bird_eye`. FastAPI, PostGIS access and APScheduler are not installed yet.

## Commands

Run from `backend/`.

```bash
uv sync              # create .venv and install dependencies
uv run backend       # run the template entry point (prints a greeting)
uv add <package>     # add a dependency; add a licence register row first
```

- Run the API server: not set up yet.
- Tests: not set up yet.
- Lint and format: not set up yet.
- Database migrations: not set up yet.

## Rules

- **Clients never touch the database.** The phone and dashboard go through the API only. Reason: one place validates every write.
- **Deduplicate by `client_id`.** Ingest ignores a detection whose `client_id` is already stored. Reason: the phone retries uploads, and a retry must not create a second sighting.
- **Agents have no send tool and no status-change tool.** They only read data and save drafts. Reason: nothing leaves the system and no defect changes state without a supervisor.
- **Every agent claim cites defect IDs.** Every number, date and location in a draft comes from a tool result, and the draft stores the defect IDs it used. Reason: a reviewer can check each claim.
- **Never install PyTorch here.** Training lives in `../ml/`. Reason: the server must stay small, and this is why `ml/` is a separate uv project.
- Thresholds such as the merge radius, coverage distance and clean pass count are config values marked as starting values.
- A segment is seen on a pass when active seconds within 10 m times the range's frame rate reach 6 frames (starting value). `scanning` and `cooling` are active; `paused` is not. A pass is one device's continuous active traversal; same-device passes count separately only if at least 1 hour apart. Coverage and repair confirmation use the same rule.
- A clean pass is a seen pass with no matching detection. Confirming a fix needs about 3 clean passes on at least 2 different days. The rule does not detect occlusion; the 2-day rule only reduces that risk.
- Do not snap pins to roads. Store the nearest segment ID for coverage only.
- Errors use FastAPI's default `{"detail": ...}` format.
- No authentication in the hackathon build. Do not add keys or logins; they are out of scope.
