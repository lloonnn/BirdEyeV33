# Bird Eye v33 Decisions

This file wins over every other document in the repo, including `docs/reference/`, `docs/architecture.md` and any CLAUDE.md. Reason: the reference sources are out of date, and this file records what the team decided after them. When a decision changes, update this file first, then the documents that depend on it.

## 1. Scope

### In scope for the hackathon build

| Item | Reason |
|---|---|
| eagle Android app with on-device detection, crop blur, local queue, upload, heat handling | Detection on the phone means only kilobyte records cross the network and video never leaves the device |
| Two classes: pothole and crack | The maintenance team needs fix-first decisions, not crack types, and RDD2022 labels both |
| FastAPI backend with ingest, merge, lifecycle, urgency and repair confirmation | These turn noisy sightings into tracked defects, which is the core of the product |
| Work order agent and daily brief agent, with supervisor approval | They show the agent layer with a human in control of anything that leaves the system |
| Dashboard: Overview map, Review, Work orders, Daily brief | These are the screens a supervisor needs to act on defects |
| Training pipeline in `ml/`: RDD2022, PyTorch, conversion to LiteRT, evaluation gate | The first model must exist and must not regress when retrained |
| Cars and vans in one Elmina precinct | Phones are unreliable on motorcycles in Malaysian heat and vibration |

### Out of scope

Do not add any of these. Each one is future work, listed in `docs/architecture.md` section 11.

| Item | Reason |
|---|---|
| Authentication, per-phone keys, dashboard login and roles | Not needed to prove the loop in a demo; added once SDP adopts the system |
| Shift records on the server | The server groups data by device and time, which is enough for the pilot |
| Township boundary setting | Patrol vehicles stay in their precinct, and the server ignores detections off the pilot road segments |
| Resident page | Residents are out of scope for the prototype; they benefit indirectly from faster repairs |
| Motorcycles | Phones overheat and suffer from vibration without air conditioning |
| Extra defect classes: drains, street lights, fallen trees, illegal dumping, and others | The first model has 2 classes; drains have no public labelled dataset |
| Escalation agent and council reports | It needs data on which roads were handed to the council, which the pilot does not have |
| Local Malaysian training data | There is none yet; measuring local accuracy is the first task of the pilot |
| Rain forecast in the urgency score | It only mattered for drains, which are not detected |
| Coverage and device status: the Coverage and Devices pages, `GET /coverage`, `GET /devices`, and backend storage of heartbeats and tracks | Removed from the prototype by decision 93; kept as designed for after the prototype |

## 2. Decision log

Status values: **decided**, **starting value** (a tunable number, untested), **you decide** (the team must choose), **verify** (a fact to check), **deferred** (later), **mentors** (ask the hackathon mentors or SDP), **after the prototype** (cut from the prototype scope by decision 93; kept for later).

### Product, scope and process

| # | Decision | Reason | Status |
|---|---|---|---|
| 1 | Product name is Bird Eye v33. "Patrol Eye" in the sources is the old name. | One name across code, docs and pitch | decided |
| 2 | Folders: `eagle/` (Android, package `com.birdeye`), `backend/` (FastAPI, uv), `dashboard/` (Next.js), `ml/` (training and conversion) | One folder per runtime, so each has its own build and owner | decided |
| 3 | `backend/` and `ml/` are separate uv projects | The server never installs PyTorch | decided |
| 4 | Pilot scope: cars and vans, one Elmina precinct | Phones are unreliable on motorcycles | decided |
| 5 | No authentication, shift records, township boundary or resident page in the hackathon build | Keeps the build focused on the detection to repair loop | decided |
| 6 | Write only new code; do not copy from personal projects or the web | Hackathon IP terms, clauses 11 and 12.2 | decided |
| 7 | Licence register not required for the hackathon prototype. Licence review is deferred until before any SDP deployment (T&C clauses 14.1 and 14.3 still apply then). | Checking every package costs hackathon time, and the prototype is not deployed at SDP | decided |
| 8 | No Ultralytics or other AGPL code anywhere in the repo | AGPL may conflict with the hackathon IP terms | decided |
| 9 | Keep Claude Code's Co-Authored-By trailer on commits | Hackathon terms clause 13.1 require disclosing material AI use, and the trailer is the record | decided |
| 10 | SDP's current defect finding method and typical repair time | They are the baseline the pilot is measured against | mentors |

### Model and training

| # | Decision | Reason | Status |
|---|---|---|---|
| 11 | Train in PyTorch, convert once to TensorFlow Lite (LiteRT), run on the phone with the GPU delegate | PyTorch for training; LiteRT with the GPU delegate is fast enough on a phone | decided |
| 12 | The first model has 2 classes, pothole and crack, trained on RDD2022 only | Fix-first decisions need no crack types; no local labelled data exists yet | decided |
| 13 | Never claim accuracy on Malaysian roads | RDD2022 has no Malaysian images, so the model is untested there | decided |
| 14 | Locally recorded footage is for testing and the demo only, not training | No local data is used for training yet; local testing happens in the pilot | decided |
| 15 | Detector choice; candidate YOLOX (Apache 2.0) | Ultralytics YOLO is AGPL-3.0, which may conflict with the hackathon IP terms | you decide |
| 16 | Tool for converting PyTorch to LiteRT | Ultralytics export is ruled out with Ultralytics | you decide |
| 17 | Fallback if the RDD2022 model misses most local defects before the demo | Local labelling is ruled out for now | you decide |
| 18 | Evaluation gate metric: mAP@0.5 per class | A standard detection metric that compares models class by class | starting value |
| 19 | If RDD2022 test labels are not public, hold out a fixed slice of the training data | Every model must be measured against the same test | verify |
| 20 | Speed check: 3 frames a second on the cheapest team phone | A model that is accurate but too slow cannot run on a patrol | starting value |
| 21 | Commit only the bundled fallback `.tflite` in eagle assets; gitignore all other `.tflite` files | The app needs one model to work offline; other model files are large build outputs | decided |
| 22 | Model delivery: `GET /config` and `GET /models/{version}` at shift start; the bundled model is only the offline fallback | Models update without an app release | decided |

### eagle app

| # | Decision | Reason | Status |
|---|---|---|---|
| 23 | eagle min SDK is 26 | `java.time` works natively from API 26 without desugaring, and the app writes timestamps with offsets | decided |
| 24 | The Android theme is `BirdEyeTheme()` in `eagle/app/src/main/java/com/birdeye/ui/theme/BirdEyeTheme.kt`; the template `Theme.kt`, `Color.kt` and `Type.kt` are deleted | One named theme for the app, matching the dashboard tokens | decided |
| 25 | Theme token source of truth: `dashboard/app/globals.css` and `BirdEyeTheme.kt`, not the reference source | The running code is what users see | decided |
| 26 | Every threshold is a config value marked as a starting value, never hard-coded | Thresholds change during testing without a code change or app release | decided |
| 27 | Duplicate filter: same class within 5 m and 5 s | One pothole becomes one record per pass | starting value |
| 28 | Upload in batches every 5 minutes during the shift over mobile data; end-of-shift WiFi sync is dropped | Records are kilobytes and the dashboard is live | decided (interval is a starting value) |
| 29 | `urgent` is always false in the 2-class version; the field is kept | No pothole or crack needs to jump the batch; future classes may | decided |
| 30 | Heartbeat states: `scanning` is active at full rate; `cooling` is active at reduced rate; `paused` is not active, with `pause_reason` `heat` or `parked`. `offline_queueing` is removed. | Each state maps cleanly to active or not active for the seen rule | decided |
| 31 | Heartbeat `online` is a boolean, separate from `state` | A phone can scan while offline | after the prototype (decision 93) |
| 32 | Heartbeat `model_error` reports a failed model load | The dashboard can show phones stuck on an old model | after the prototype (decision 93) |
| 33 | Face and plate blur model | Must run on the phone and pass the licence check | you decide |

### Backend, coverage and lifecycle

| # | Decision | Reason | Status |
|---|---|---|---|
| 34 | Demo hosting: laptop, PostgreSQL and PostGIS in Docker, crops on local disk behind a storage interface | No cloud setup for the demo; the interface lets object storage replace local disk later | decided |
| 35 | Background jobs and agent runs use APScheduler inside the backend | The pilot runs on one server, so a separate job queue adds parts without adding value | decided |
| 36 | No pin snapping; store the nearest segment ID for coverage only | Snapping can move a pin onto the wrong road at a junction | decided |
| 37 | Pass: one device's continuous active traversal of a segment; same-device passes count separately only if at least 1 hour apart | A car circling one block must not pile up passes within minutes | after the prototype (decision 93) |
| 38 | Seen: 6 or more frames, computed as active seconds within 10 m of the segment times the frame rate; track active ranges carry the frame rate | The phone sends no per-frame data, so the backend estimates frames from the track | after the prototype (decision 93) |
| 39 | A later pass is a clean pass only if the segment was seen and no matching defect was detected; otherwise it is "not seen", never clean | Heat pauses, parked phones and undriven roads must not confirm repairs | after the prototype (decision 93) |
| 40 | The seen rule does not detect occlusion. A car parked over a pothole still yields a clean pass. Mitigation: clean passes must fall on at least 2 different days. | A parked car rarely stays in one spot across days; this reduces the risk but does not remove it | after the prototype (decision 93) |
| 41 | Fixed to Confirmed after about 3 clean passes | Coverage, not time, confirms a fix | after the prototype (decision 93) |
| 42 | Detected to Verified after sightings on 3 distinct passes | One bad record cannot create a verified defect | starting value |
| 43 | Main roads: OSM `highway` primary, secondary, tertiary. School routes: segments within 300 m of an OSM school. | Both come from the same OSM load as the segments | starting value |
| 43a | Junction: a segment within 30 m of an OSM node shared by 3 or more ways | Comes from the same OSM load as the segments | starting value |
| 44 | In the urgency type term, a pothole scores higher than a crack | A pothole is the more immediate hazard to vehicles and motorcyclists; final values are set with SDP | starting value |
| 45 | Urgency weights start equal | The weights are set with SDP, not guessed | starting value |
| 46 | The urgency score has no rain term | Rain only mattered for drains, which are not detected | decided |
| 47 | Track upload field names | Superseded by decision 77 | superseded |
| 48 | Response bodies for endpoints other than the detection record and heartbeat | Superseded by decisions 62 to 77 | superseded |
| 49 | Error format: FastAPI's default `{"detail": ...}`; status codes in decision 79 | No extra code; a custom format is deferred | decided |

### API

| # | Decision | Reason | Status |
|---|---|---|---|
| 50 | New endpoints: `POST /defects/{id}/verify`, `POST /defects/{id}/reject`, `PATCH /work-orders/{id}`, `POST /work-orders/{id}/reject`, `POST /work-orders/{id}/done`, `GET /brief/latest` | The lifecycle and dashboard need an endpoint for every supervisor action | decided |
| 62 | `docs/api-contract.md` is v0, marked "v0, prototype; may change". A shape change updates the contract and adds a row here. | No endpoint is built yet, and building them will expose mistakes; the dashboard can mock against fixed shapes meanwhile | decided |
| 63 | `GET /defects?bbox=minLon,minLat,maxLon,maxLat&type=&status=&sort=urgency_desc&limit=` returns a list of defect objects. `bbox` is required; `urgency_desc` is the only sort in v0. | The map reads only the visible area, and the repair list is ranked by urgency | decided |
| 64 | Defect object: `id`, `type`, `status`, `urgency` (0 to 1), `urgency_band` (`high`, `medium`, `low`), `urgency_terms` {`type`, `size`, `location`, `age`}, `lat`, `lon`, `first_seen`, `last_seen`, `sighting_count`, `crop_url` (best crop), `segment_id`, `work_order_id` (null when none) | The terms show supervisors why a defect ranks where it does, which is the point of a visible formula; `work_order_id` saves the dashboard searching every work order | decided |
| 65 | Cut-offs that turn `urgency` into `urgency_band`; a backend config value | The contract needs the band, but no cut-off has been chosen | you decide |
| 66 | New endpoint `GET /defects/{id}`: the defect object plus `sightings[]` {`id`, `captured_at`, `confidence`, `crop_url`, `device_id`} | A supervisor needs every crop and sighting to judge one defect | decided |
| 67 | `POST /defects/{id}/verify` and `/reject` take no body, return the updated defect, and return 409 if the defect is not in Detected | The lifecycle allows both actions only from Detected | decided |
| 68 | `GET /reviews` returns a list of {`id`, `status` (`pending`, `answered`), `sighting`: the detection record plus `crop_url`} | The supervisor judges the crop with the record that produced it | decided |
| 69 | `POST /reviews/{id}` body {`answer`: `correct`, `wrong_class` or `not_defect`, `class`: `pothole` or `crack`, required for `wrong_class`}. `correct` merges like a save-band record; `wrong_class` merges with the corrected class; `not_defect` stores a negative example and creates no defect. Returns the updated review; 409 if already answered. | Each answer either feeds the defect map or becomes training data, so no label is wasted | decided |
| 70 | `GET /work-orders?status=` returns a list of {`id`, `status` (`pending_approval`, `approved`, `rejected`, `done`), `crew_type`, `description`, `defect_ids`, `created_at`, `approved_at`} | One shape serves the approval queue and the job history | decided |
| 71 | Work order approve, reject and done take no body and return the updated work order. Approve moves its defects to Scheduled; done moves them to Fixed. `PATCH` accepts `description`, `crew_type`, `defect_ids`. Approve, reject and `PATCH` work from `pending_approval` only, done from `approved` only; otherwise 409. | Matches the lifecycle; a supervisor edits a draft before approving it, not after | decided |
| 72 | `GET /devices` returns a list of {`device_id`, `vehicle`, `last_heartbeat_at`, `state`, `pause_reason`, `online`, `queue_size`, `battery_temp_c`, `thermal_status`, `frame_rate`, `app_version`, `model_version`, `model_error`, `unreachable`}. The backend sets `unreachable` after 5 minutes without a heartbeat. | The heartbeat already sends these fields, and the Devices page needs them to show phones stuck on an old model; the backend decides unreachable once, so every screen agrees | after the prototype (decision 93) |
| 73 | `GET /coverage?bbox=&since=` returns a GeoJSON FeatureCollection of segments with properties {`segment_id`, `road_class`, `last_scanned_at`, `target` (`daily`, `weekly`), `overdue`} | GeoJSON draws directly as a Leaflet layer | after the prototype (decision 93) |
| 74 | `GET /brief/latest` returns {`id`, `created_at`, `text`, `defect_ids`}, or 404 when none exists | `defect_ids` lets a reviewer check each claim; 404 tells the dashboard to show an empty state | decided |
| 75 | `GET /config` returns the thresholds from the app plan as v0 placeholders, plus `model_version` and `model_sha256`. `GET /models/{version}` returns the raw `.tflite` bytes. | The phone checks the hash before loading, so a broken download never replaces a working model | decided (threshold values are starting values) |
| 76 | `POST /detections/batch` is multipart: a JSON part `records` (array of detection records) and one file part per crop named by `crop_file`. Returns 200 {`accepted`, `duplicates`}. | Records and crops arrive together, so a sighting is never stored without its crop | decided |
| 77 | `POST /tracks` body {`device_id`, `points[]` {`t`, `lat`, `lon`, `accuracy_m`}, `active_ranges[]` {`start`, `end`, `frame_rate`}}. `POST /tracks` and `POST /heartbeat` return 204. | The seen rule needs active ranges with frame rates; the phone needs no reply body | after the prototype (decision 93) |
| 78 | Phone retry: network errors, 5xx and 429 are retried; any other 4xx marks the batch rejected | Those failures are temporary; another 4xx means the request is wrong and resending cannot fix it. Retries are safe because ingest deduplicates by `client_id`. | decided |
| 79 | Error status codes: 404 not found, 409 wrong state, 422 validation, all in FastAPI's `{"detail": ...}` format | Clients can tell a missing item from a forbidden action without parsing text | decided |
| 80 | The dashboard calls the backend directly at `NEXT_PUBLIC_API_BASE_URL`; the backend enables CORS for the dashboard origin; no proxy | One address to configure and no rewrite layer to debug | decided |
| 82 | `GET /defects` `status=` accepts one status or a comma-separated list | The fix-first list shows several statuses at once, such as verified and scheduled | decided |
| 83 | Defect object adds `confirmed_at`, `null` until the defect reaches Confirmed | The dashboard can show how long a repair has held | decided |
| 84 | Defect `work_order_id` is set when a work order covering the defect is approved; it is non-null exactly when a job covers the defect, and `null` otherwise | One clear rule, so the dashboard never shows a draft as a job | decided |
| 85 | Defect object adds `location_reasons`: a list of `school`, `main_road`, `junction` | The supervisor sees why the location term scored high, without street names | decided |
| 86 | `GET /defects/{id}` adds `history[]` {`status`, `at`}, oldest first | A reopened defect keeps its past, and the supervisor can see it | decided |
| 87 | New endpoint `GET /work-orders/{id}` returns one work order, or 404 | The dashboard can open a defect's job from its `work_order_id` | decided |
| 88 | `GET /reviews` adds `status=` (`pending` or `answered`), default `pending` | The review queue shows only work still to do | decided |
| 89 | `PATCH /work-orders/{id}` may only remove `defect_ids` in the prototype: a defect not already on the job gives 422; an empty result gives 409 | The agent groups defects, so the supervisor can only take defects out; a job with no defects means nothing | decided (422 confirmed by the team) |

### Agents

| # | Decision | Reason | Status |
|---|---|---|---|
| 51 | Agents live in the backend package `bird_eye.agents` | They call the same backend functions as the API, so a separate service adds nothing | decided |
| 52 | The escalation agent is not built in this version | It needs data on which roads were handed to the council, which the pilot does not have | decided |
| 53 | Daily brief at 07:00 Malaysia time | Before the first shift, as the source requires | starting value |
| 54 | Language model for the agents | Superseded by decision 92 | superseded |
| 92 | Agents use Gemini through the `google-genai` SDK with a plain Python tool loop; no agent framework | A short loop the team writes is easy to read and log, and a framework adds code nobody needs for two agents | decided |

### Dashboard and demo

| # | Decision | Reason | Status |
|---|---|---|---|
| 55 | Map: plain Leaflet in one React component, not react-leaflet | react-leaflet is Hippocratic-2.1, not OSI, and may conflict with SDP commercial use | decided |
| 56 | Dashboard is dark by default via `className="dark"` on `<html>` | shadcn switches theme with the `.dark` class, and the design is dark first | decided |
| 57 | The demo uses real potholes and cracks recorded nearby; staged rubbish, branches and leaves are not used | The 2-class model cannot detect the staged items | decided |
| 58 | Repair confirmation in the demo uses the scenario script | A real repair cannot be staged safely within the hackathon | decided |
| 59 | No demo scene for a "not seen" pass | Demo time is short | decided |
| 60 | Plain HTTP in the demo only, phone to laptop on local Wi-Fi, through an Android network security config that allows cleartext for the laptop's address only; any server off the laptop uses HTTPS | A laptop on local Wi-Fi has no trusted certificate; limiting cleartext to one address keeps everything else on HTTPS | decided |
| 61 | Bundle Geist and Geist Mono in the app instead of Google downloadable fonts | No font certificates file, and type works offline | decided |
| 81 | Dashboard map tiles: CARTO Dark Matter with CARTO and OpenStreetMap attribution, prototype use only. Tile URL lives in one setting. | A dark base map matches the dark dashboard; one setting lets the tiles change before any SDP deployment without a code change | decided |
| 90 | The dashboard asks for an action code before supervisor actions. It is a speed bump against stray clicks, not security. The backend stays without authentication (decision 5) and runs on the laptop only. | A stray click must not approve a job or reject a defect; real access control is out of scope | decided |
| 91 | No street or place names in the UI | OSM street names are not a reliable source; pins are not snapped to roads, so a name could belong to the wrong road; and with no place names the product can be shown for any SDP township | decided |
| 93 | Coverage and device status are removed from the prototype scope (user decision, 14 Oct 2026). This cuts the Coverage and Devices pages, `GET /coverage`, `GET /devices`, and the backend storage of heartbeats and tracks. Decisions 31, 32, 37 to 41, 72, 73 and 77 move to after the prototype. | Hackathon time goes to the detection to repair loop; the designs are kept for later | decided |
| 94 | Without stored tracks there are no passes, seen segments or clean passes. How the prototype moves a defect from Fixed to Confirmed, and counts the 3 passes for Detected to Verified (decision 42), outside the scenario script (decision 58) | The rules in decisions 37 to 42 need tracks, which decision 93 cuts | you decide |

## 3. Licence register

Not required for the hackathon prototype (decision 7). The rows are kept as a starting point for the licence review before any SDP deployment. "Licence" is what the package registry or repository reports. "verify" means the licence or its fit with the hackathon IP terms is not confirmed.

| Item | Use | Licence | Status |
|---|---|---|---|
| RDD2022 | Training data for the first model | Not checked; also check whether test labels are public | verify |
| Detector | On-device pothole and crack detection | Undecided; candidate YOLOX (Apache 2.0, not checked) | undecided |
| Face and plate blur model | Blurring crops on the phone | Undecided | undecided |
| CARTO Dark Matter tiles | Dark base map on the dashboard, prototype use only (decision 81) | Commercial use needs a licence | verify before any SDP deployment |
| Satellite tiles | Optional map layer | Not chosen, not checked | verify |
| Bklit UI | Not used; replaced by Recharts | Not checked | removed |
| shadcn/ui (`shadcn` package) | Dashboard components | MIT (npm metadata) | confirmed |
| `@base-ui/react` | Primitives under shadcn Vega | MIT (npm metadata) | confirmed |
| Next.js | Dashboard framework | MIT (npm metadata) | confirmed |
| Recharts | Charts in the current dashboard scaffold | MIT (npm metadata) | confirmed |
| Leaflet | Map engine, wrapped in one React component | BSD-2-Clause (npm metadata) | confirmed |
| react-leaflet | Not used; replaced by plain Leaflet | Hippocratic-2.1 (npm metadata), not an OSI licence | rejected |
| Leaflet marker clustering plugin | Clustering defect pins | Plugin not chosen, not checked | verify |
| LiteRT | On-device inference | Apache-2.0 (GitHub `google-ai-edge/LiteRT`) | confirmed; check the Android artifact when adding |
| PyTorch | Training in `ml/` | Apache-2.0 and others (PyPI metadata) | confirmed |
| FastAPI | Backend API | MIT (PyPI metadata) | confirmed |
| python-multipart | FastAPI's parser for the multipart `POST /detections/batch` (decision 76) | Not checked; check PyPI metadata when adding | verify |
| Starlette `CORSMiddleware` | CORS for the dashboard origin (decision 80); Starlette is installed with FastAPI | Not checked; check PyPI metadata when adding | verify |
| APScheduler | Backend job scheduling | MIT (PyPI metadata) | confirmed |
| PostgreSQL | Database | Not checked | verify |
| PostGIS | Spatial queries in the database | GPL-2.0 (GitHub `postgis/postgis`) | low risk: used as a server, not distributed; confirm with organisers |
| PostGIS Docker image | Demo database on the laptop | Not checked | verify |
| OpenStreetMap data | Road segments for coverage | ODbL, attribution required | confirmed; show attribution on the map |
| CameraX, Room, WorkManager, Jetpack Compose | eagle app | Not checked | verify |
| Google Play services location | GPS in eagle | Not checked | verify |
| Geist and Geist Mono fonts | Dashboard type (next/font); app type bundled in `eagle/app/src/main/res/font/` from vercel/geist-font v1.7.2 | SIL OFL 1.1 (`OFL.txt` in the release; copy in `eagle/app/src/main/assets/licenses/`) | confirmed |
| Gemini API via the `google-genai` SDK | Agents (decision 92) | Not checked | review deferred until before any SDP deployment (decision 7) |
