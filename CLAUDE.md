# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Bird Eye v33 is a hackathon prototype that turns township patrol vehicles into a daily road inspection network. A phone in each car runs a small detector that finds potholes and cracks, blurs the crop and uploads a small record. A FastAPI backend merges sightings into tracked defects, ranks them by urgency and confirms repairs from later passes that actually saw the spot. A Next.js dashboard shows the map, review queue, agent-drafted work orders, coverage and device status. All four parts are at the scaffold stage, so most features described in the docs are not built yet.

## Repo map

Each folder is an independent project with its own build. Run commands from inside the folder. Each has its own CLAUDE.md with commands and rules.

| Folder | What | Stack |
|---|---|---|
| `eagle/` | Android app (eagle is the app's name) | Kotlin, Jetpack Compose, Gradle with version catalog, package `com.birdeye` |
| `backend/` | API, workers, agents | Python, FastAPI, uv |
| `dashboard/` | Staff web dashboard | Next.js, Tailwind 4, shadcn/ui Vega, npm |
| `ml/` | Training and conversion to LiteRT | Python, PyTorch, uv (separate from `backend/`) |
| `docs/` | Architecture, API contract, decisions | Markdown |
| `docs/reference/` | Original proposal and architecture sources | Read-only, out of date |

There is no root build, no shared code and no CI. Nothing links the four projects yet except the API contract.

## Global rules

- **`docs/decisions.md` wins over everything else**, including the reference sources, the architecture doc and these CLAUDE.md files. Reason: the sources are out of date and decisions.md records the current choices.
- **Do not add anything decisions.md lists as out of scope:** authentication, keys, login, shift records, township boundary, resident page, motorcycles, extra defect classes. Reason: they are deliberate future work, and building them wastes hackathon time.
- **Write only new code.** Do not copy code from personal projects or the web. Reason: hackathon IP terms, clauses 11 and 12.2.
- **No new dependency, dataset, model, map tile source or API without a row in the licence register** in `docs/decisions.md`. No Ultralytics or other AGPL code. Reason: every third-party item must fit the hackathon IP terms, and AGPL may not.
- **The model has 2 classes: pothole and crack.** Never claim accuracy on Malaysian roads. Reason: the model is trained on RDD2022 only, which has no Malaysian images.
- **Every threshold is a config value marked as a starting value**, never hard-coded. Reason: thresholds are untested and must change without a code change or app release.
- **`docs/reference/` is read-only.** Reason: it is the historical source; corrections go into the docs that override it.
- Keep Claude Code's Co-Authored-By trailer on commits. Reason: hackathon terms clause 13.1 require disclosing material AI use. See CONTRIBUTING.md.
- Writing style for docs: plain short sentences, a reason for every claim, no em dashes, maths in `$...$` or `$$...$$`.

## Docs

- [docs/decisions.md](docs/decisions.md): scope, decision log, licence register. Read it first.
- [docs/architecture.md](docs/architecture.md): how the system works, end to end.
- [docs/api-contract.md](docs/api-contract.md): endpoints and JSON payloads between the phone, backend and dashboard.
- [CONTRIBUTING.md](CONTRIBUTING.md): branches, commits, reviews, owners.
