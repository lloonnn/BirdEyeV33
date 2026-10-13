# Bird Eye v33

Phones in township patrol cars and vans detect potholes and cracks on the device. A backend tracks each defect and confirms repairs from later passes.

## Status

Bird Eye v33 is a hackathon prototype for the SDP University Hackathon 2026. Most of the system is designed but not built yet. The design is in [docs/architecture.md](docs/architecture.md).

What works today:
- **eagle (Android app):** the project builds with `./gradlew assembleDebug`. It applies the Bird Eye theme (`BirdEyeTheme`) with bundled Geist fonts and shows a single placeholder greeting screen.
- **dashboard:** the project builds with `npm run build`. It serves the create-next-app start page at `/` and a shadcn dashboard layout with mock data at `/dashboard`. The Bird Eye colour tokens are in `app/globals.css`, and dark mode is on by default. `npm run lint` passes.

What does not exist yet:
- On-device detection, camera capture, GPS, the local queue and uploads in the app.
- The backend API, database, workers and agents. `backend/` is an empty uv project.
- The detector model and the training pipeline. `ml/` is an empty uv project.
- Real dashboard pages: map, review queue, work orders, coverage and devices.

## How it works

1. **Detect on the phone.** A small object detector runs on camera frames and finds potholes and cracks. Faces and number plates in the crop are blurred on the phone. Reason: video never leaves the device.
2. **Upload small records.** The phone uploads a cropped image, location and time in batches during the shift. Reason: records are kilobytes, so mobile data is enough.
3. **Merge into defects.** The backend merges repeated sightings of the same defect into one record with a history. Reason: one pothole seen on many passes is still one job.
4. **Rank by urgency.** A visible weighted score ranks defects by type, size, location and age. Reason: supervisors can see why a defect is at the top.
5. **Confirm the repair.** After a repair, the defect is confirmed fixed only after clean passes on at least 2 different days, where the spot was actually seen with no detection. Reason: a road nobody drove, or a phone paused for heat, must not confirm a fix.

Detail: [docs/architecture.md](docs/architecture.md).

## What we claim and what we do not

- The model has 2 classes only: pothole and crack.
- It is trained on RDD2022 only, a public road damage dataset with no Malaysian roads.
- We claim no accuracy for Malaysian roads. Reason: the model has not been tested on them. Measuring it is the first task of a pilot.
- Drains, street lights, fallen trees and illegal dumping are not detected. They are future work.

## Repo map

| Folder | What it is |
|---|---|
| [`eagle/`](eagle/CLAUDE.md) | Android app that detects defects on the phone (Kotlin, Jetpack Compose) |
| [`backend/`](backend/CLAUDE.md) | API, background jobs and agents (Python, FastAPI, uv) |
| [`dashboard/`](dashboard/CLAUDE.md) | Staff web dashboard (Next.js, shadcn/ui; Leaflet planned, not installed) |
| [`ml/`](ml/CLAUDE.md) | Model training and conversion to LiteRT (Python, PyTorch, uv) |
| [`docs/`](docs/decisions.md) | Architecture, API contract, decisions and licence register |

## Prerequisites

Versions come from the files named in brackets.

- **Android Studio** with its bundled JDK, recent enough for Android Gradle plugin 9.4.1 (`eagle/gradle/libs.versions.toml`). The wrapper downloads Gradle 9.6.0 (`eagle/gradle/wrapper/gradle-wrapper.properties`), the Gradle daemon uses JDK 25 (`eagle/gradle/gradle-daemon-jvm.properties`), and the app compiles against SDK 37 (`eagle/app/build.gradle.kts`).
- **Node.js** 20.9 or later, required by Next.js 16.4 (`dashboard/package.json`), with npm.
- **uv** 0.12.x, matching the `uv_build>=0.12.23,<0.13.0` build backend, and Python 3.14 (`.python-version` and `pyproject.toml` in `backend/` and `ml/`). uv can install Python 3.14 itself.

## Getting started

Each folder is a separate project. Run commands from inside it.

**eagle**

```bash
./gradlew assembleDebug                 # build the debug APK
./gradlew installDebug                  # install on a connected device or emulator
./gradlew testDebugUnitTest             # JVM unit tests (template examples only)
```

**dashboard**

```bash
npm install
npm run dev                             # http://localhost:3000
npm run build
npm run lint
```

**backend** and **ml**

```bash
uv sync
uv run backend                          # in backend/: template entry point only
uv run ml                               # in ml/: template entry point only
```

Not set up yet: the backend API server, database, tests and migrations; training, evaluation and conversion in `ml/`; dashboard tests.

## Documentation

- [docs/architecture.md](docs/architecture.md): how the system works, end to end.
- [docs/api-contract.md](docs/api-contract.md): endpoints and payloads between the phone, backend and dashboard.
- [docs/decisions.md](docs/decisions.md): scope, decision log and licence register. It overrides every other document.
- [CONTRIBUTING.md](CONTRIBUTING.md): branches, commits, reviews and owners.

## Questions

Common questions and answers: [docs/faq.md](docs/faq.md).

## Licences and AI use

- Third-party licences are listed in the licence register in [docs/decisions.md](docs/decisions.md).
- The hackathon IP terms apply to this code.
- AI tools (Claude) were used in design and coding. This is disclosed per the hackathon terms, and commits made with Claude Code carry a Co-Authored-By trailer.
