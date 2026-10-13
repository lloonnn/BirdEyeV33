# Contributing to Bird Eye v33

Read [docs/decisions.md](docs/decisions.md) before starting work. It wins over every other document.

## Branches

- `main` holds working code. Do not commit to it directly. Reason: every change gets a review.
- Work on short feature branches named `area/short-name`. The area is one of `eagle`, `backend`, `dashboard`, `ml`, `docs`. Examples: `eagle/camera-preview`, `backend/ingest`, `docs/decisions`.
- Keep branches short-lived and merge them soon. Reason: long branches drift and conflict.

## Commits

- Start every commit message with the area, then a colon. Example: `backend: add client_id dedup to ingest`. Reason: the history shows at a glance which part changed.
- Keep Claude Code's `Co-Authored-By` trailer on every commit it helped write. Do not remove it. Reason: hackathon terms clause 13.1 require disclosing material AI use, and the trailer is the record.

## Pull requests

- One teammate reviews each PR before it merges. Reason: a second reader catches mistakes and spreads knowledge.
- A PR that adds a dependency, dataset, model, map tile source or API must add its row to the licence register in `docs/decisions.md`. Reason: hackathon IP terms.
- Write only new code. Do not paste code from personal projects or the web. Reason: hackathon IP terms, clauses 11 and 12.2.

## Owners

| Area | Owner |
|---|---|
| eagle | TBD |
| backend | TBD |
| dashboard | TBD |
| ml | TBD |
| docs | TBD |
| Pitch and business case | TBD |
