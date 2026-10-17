# backend/CLAUDE.md

The Bird Eye v33 backend for the prototype. It stores detection batches from the eagle app, merges sightings into defects, and moves each defect through its lifecycle from Detected to Confirmed. It ranks defects by a visible urgency score and serves the dashboard's defects, reviews, work orders and daily brief. Two Gemini agents draft work orders and the brief; a supervisor acts on every draft.

## Read first

1. `../docs/plans/backend.md`: the phase plan and the rules each phase builds.
2. `../docs/decisions.md`: it wins over every other file, including this one and the plan.
3. `../docs/api-contract.md` v0: every endpoint, field, status value and error code.

## Stack

- Python 3.14 (`.python-version`), uv, `src/` layout, `uv_build`. Project `bird-eye`, package `bird_eye`.
- FastAPI, SQLAlchemy Core with hand-written SQL, Alembic migrations, pydantic-settings.
- PostgreSQL with PostGIS in Docker on the laptop. Crops on local disk behind a storage interface.
- Agents in `bird_eye.agents`: Gemini through `google-genai`, a plain Python tool loop (Phase 5).

## Commands

Run from `backend/`.

```bash
uv sync                                    # install dependencies
uv run python -c "import bird_eye"         # check the package imports
uv add <package>                           # add a licence register row in decisions.md first
docker compose up -d db                    # start the database
uv run alembic upgrade head                # run migrations
uv run uvicorn bird_eye.main:app --host 0.0.0.0 --port 8000   # run the server
uv run pytest                              # run tests; needs the database
uv run python scripts/seed.py              # load invented dev data
uv run python scripts/reset_dev_data.py --yes   # empty the database
BIRDEYE_DEV_ENDPOINTS_ENABLED=true uv run uvicorn bird_eye.main:app --port 8000   # server for the scenario
uv run python scripts/scenario.py          # full lifecycle via the API; run twice (second run reopens)
```

## Rules

- **Package `bird_eye`.** Reason: decision 51 names `bird_eye.agents`.
- **Responses match api-contract.md v0 exactly.** If a phase needs a shape the contract lacks, list it for the manager chat; never invent one. Reason: the dashboard and app mock against v0.
- **Errors use FastAPI's `{"detail": ...}`** with 404 not found, 409 wrong status, 422 validation. Reason: decision 79.
- **Every threshold is a config value** in `bird_eye.settings`, commented `# starting value, to be tuned`. Reason: decision 26.
- **Deduplicate by `client_id`.** Reason: the phone retries uploads, and a retry must not store a second sighting.
- **Schema changes only through migrations.** Reason: every copy of the database must match the code.
- **Never install PyTorch here.** Reason: training lives in `../ml/`, a separate uv project (decision 3).
- **No authentication.** No keys, logins or roles. Reason: decision 5.
- **`/dev` routes are mounted only when the dev flag is on**, and return 404 otherwise. They are not part of the contract.
- **Agents only read and save drafts.** No tool changes a defect's status or sends anything out, and every draft stores the defect IDs it cites.
- **`.env` is never committed.** `GEMINI_API_KEY` and the database URL live there; `.env.example` lists the names.
- **Seed data is invented and for development only.** Reset the database before the demo.
- **Do not commit unless the user asks.**

## Out of scope for the prototype

Do not build these (decision 93 and section 1 of decisions.md):
- coverage and `GET /coverage`;
- devices and `GET /devices`;
- heartbeat storage and `POST /heartbeat`;
- tracks and `POST /tracks`;
- road segments from OSM;
- a scheduler for background jobs;
- `GET /config` and `GET /models/{version}`;
- authentication.
