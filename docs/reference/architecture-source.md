# Patrol Eye: Technical Architecture

Oct 12, 2026 · @SL

## 1. Overview

Patrol Eye has three moving parts a user touches (the patrol app, the dashboard, and indirectly the training pipeline) and four server-side parts that hold state and do the work. Every client talks only to the backend API; no client reads the database directly.

&#91;embedded content: System architecture · 7 components\]

The phone does the heavy vision work on the device, so only small records cross the network. The database is the single source of truth: every worker, agent and screen reads and writes defects there.

| Component | Runs on | Owns |
| --- | --- | --- |
| Patrol app | Dedicated Android phone in each vehicle | Camera capture, on-device detection, blurring, local queue, upload, heat handling |
| Backend API | One cloud server (Python, FastAPI) | Ingest of records and tracks, model distribution, dashboard data |
| Database and storage | PostgreSQL with PostGIS; object storage for images | Defects, sightings, GPS tracks, coverage, work orders, reviews, model versions |
| Background workers | Same server, scheduled jobs | Merging sightings into defects, urgency ranking, coverage gaps, repair confirmation |
| Agent service | Same server, calls an LLM API | Drafting work orders, daily brief, council reports; everything waits for approval |
| Dashboard | Browser, React with Leaflet | Live map, review queue, work order approval, device status, coverage view |
| Training pipeline | Developer machine or cloud GPU, run on demand | Building a dataset from reviews, retraining, evaluating, exporting and publishing a new model |

**Pilot scope:** cars and vans only, one Elmina precinct, no resident-facing screens.

## 2. Patrol app internals

The app is a Kotlin Android app built with Jetpack Compose. Its core is a frame pipeline: each camera frame either dies early (low confidence) or becomes a small record in a local queue. Four background services run beside it.

&#91;embedded content: Patrol app · frame pipeline and background services\]

Video is never stored or uploaded. Each sampled frame is analysed in memory and discarded within a fraction of a second.

**How detection works, step by step**

1. **Camera feed.** CameraX `ImageAnalysis` with the strategy that keeps only the latest frame, so a slow step never builds a backlog.
2. **Frame sampler.** Passes about 3 frames a second, the smallest rate that still sees every defect more than once. At 40 km/h the vehicle moves about 3.7 m between frames, and a defect is clearly visible over roughly 10 m of road, so each one appears in 2 to 3 frames; if one frame is blurred, another catches it. At 1 frame a second a defect can be missed entirely; at 10 the phone works three times harder and heats up with no real gain. The rate can follow GPS speed: about 2 on slow streets, 4 to 5 on faster roads. When the vehicle is parked for a while, sampling stops.
3. **Detector.** A small YOLO model exported to TensorFlow Lite, run with the GPU delegate where the phone supports it. Output: boxes, defect class and a confidence score per detection. Benchmark speed on the target phone in week one.
4. **Confidence sort.** High confidence becomes a defect record; the middle band becomes a review record; low confidence is dropped. Thresholds come from config, not code.
5. **Crop and blur.** Only the defect's bounding box, plus a margin, is cropped and compressed as JPEG. A light face and plate detector runs on the crop and blurs anything it finds before the crop is stored.
6. **Locate.** Attaches GPS position, accuracy, heading and speed, and estimates the defect's distance ahead from where its box sits in the image (see below).
7. **Duplicate filter and local queue.** The same defect shows up in several frames as the vehicle approaches. If a defect of the same type was recorded within a few metres in the last few seconds, the app keeps only the record with the highest confidence and drops the rest, so one pothole becomes one record per pass. Records are then written to SQLite through Room, so a crash or reboot loses nothing.
8. **Uploader.** A WorkManager job uploads urgent records immediately when there is signal and batches the rest, retrying with backoff.

**Background services**

- **Thermal manager:** reads Android's thermal status and battery temperature. As heat rises it lowers the frame rate, then pauses the pipeline, then resumes when the phone cools. Every pause is logged so the backend knows which roads were not scanned.
- **Config sync:** at shift start, fetches the current model version and thresholds; downloads only what changed; keeps the last good copy for offline use.
- **Track logger:** records a GPS point every second or two while scanning, simplifies the line, and uploads it with the batch. The backend turns tracks into coverage.
- **Heartbeat:** posts device status every 60 seconds: scanning or paused for heat, queue size, temperature, app and model version.

**Estimating distance ahead.** With the phone at a known height above the road and a known downward tilt (set during the mount check), the row of the box's bottom edge in the image gives the angle below the horizon, and flat-road geometry gives the distance:

```latex
d = \frac{h}{\tan(\alpha + \beta)}
```

where h is the camera height, α the camera's downward tilt and β the angle of the box's bottom edge below the image centre. The defect pin is then offset by d along the vehicle's heading. This assumes a flat road; treat it as an estimate that averaging many sightings improves.

**Running all shift.** The pipeline runs in an Android foreground service with a persistent notification, started while the app is open on the start-shift screen. Check the current Android rules for camera use in foreground services on your target Android version. Inference runs on its own background thread; the UI thread only shows status.

**Starting parameters, all tunable through config**

| Parameter | Starting value |
| --- | --- |
| Sampled frame rate | about 3 per second |
| Model input size | 640 px, drop to 320 px if too slow or hot |
| Confidence bands | above 0.8 save, 0.3 to 0.8 review, below 0.3 drop |
| Crop | defect box plus margin, JPEG, longest side about 640 px |
| GPS interval | 1 second while scanning |
| Heartbeat | every 60 seconds |

These are starting points, not tested values; tune them during the heat test and the shadow run.

## 3. Data contracts

All traffic is JSON over HTTPS, except crop images, which upload as multipart files. There is no authentication during the hackathon: the server accepts uploads from the patrol app and the dashboard has no login. Keys and logins are future improvements, added once SDP adopts the system.

**API endpoints**

| Method and path | Caller | Purpose |
| --- | --- | --- |
| `GET /config` | Phone | Current model version and thresholds |
| `GET /models/{version}` | Phone | Download the TFLite model file |
| `POST /detections/batch` | Phone | Upload a batch of detection records with their crops |
| `POST /tracks` | Phone | Upload a simplified GPS trace for a shift segment |
| `POST /heartbeat` | Phone | Device status every 60 seconds |
| `GET /defects` | Dashboard | Defects in a map area, filtered by type, status, urgency |
| `GET /reviews` and `POST /reviews/{id}` | Dashboard | Unsure detections to label, and the supervisor's answer |
| `GET /work-orders` and `POST /work-orders/{id}/approve` | Dashboard | Agent-drafted jobs waiting for approval |
| `GET /devices` and `GET /coverage` | Dashboard | Live device status and scanned versus missed road segments |

**Detection record, sent by the phone**

```json
{
  "client_id": "3f6c9e2a-uuid-made-on-phone",
  "device_id": "car-03",
  "captured_at": "2026-10-12T08:14:22+08:00",
  "defect_type": "pothole",
  "confidence": 0.91,
  "band": "save",
  "bbox": [412, 588, 506, 640],
  "vehicle": { "lat": 3.1834, "lon": 101.5139, "gps_accuracy_m": 4.2, "heading_deg": 87, "speed_kmh": 36 },
  "distance_ahead_m": 14.5,
  "defect_point": { "lat": 3.1834, "lon": 101.5142 },
  "model_version": "m-2026-10-01",
  "urgent": false,
  "crop_file": "3f6c9e2a.jpg"
}
```

The values above are illustrative. `band` is `save` or `review`; dropped detections are never sent. `client_id` is generated on the phone so a retried upload is recognised and not stored twice.

**Heartbeat, sent every 60 seconds**

```json
{
  "device_id": "car-03",
  "sent_at": "2026-10-12T08:15:00+08:00",
  "state": "scanning",
  "queue_size": 3,
  "battery_temp_c": 38.5,
  "thermal_status": "light",
  "frame_rate": 3,
  "app_version": "0.4.1",
  "model_version": "m-2026-10-01",
  "position": { "lat": 3.1834, "lon": 101.5139 }
}
```

`state` is one of `scanning`, `cooling`, `paused`, `offline_queueing`. If no heartbeat arrives for several minutes during a shift, the dashboard marks the device as unreachable.

**Track upload.** A simplified line of GPS points with timestamps, plus the time ranges when scanning was active. The backend uses only the active ranges for coverage, so road driven while the phone was cooling counts as missed.

## 4. Backend processing

The backend turns many noisy sightings into a small set of tracked defects, each with a status, an urgency and a history.

**Core tables**

| Table | Holds |
| --- | --- |
| `sightings` | Every uploaded detection record, raw, with its crop reference |
| `defects` | One row per real-world defect: type, location, status, urgency, first and last seen |
| `reviews` | Unsure detections waiting for a supervisor, and the answer |
| `tracks` | Simplified GPS lines per shift, with active scanning ranges |
| `road_segments` | The township's roads split into short segments, with last scanned time |
| `work_orders` | Agent-drafted and approved repair jobs, linked to defects |
| `models`, `devices` | Model versions, and a simple list of phone names and their vehicles |

**Ingest.** `POST /detections/batch` validates each record, ignores any `client_id` already stored, saves the crop to object storage and inserts into `sightings`. Review-band records also go into `reviews`.

**Merge sightings into defects.** For each new save-band sighting, look for an open defect of the same type within a small radius, starting at about 8 m, using PostGIS `ST_DWithin`. If found, attach the sighting, update last seen and refine the defect's position as the average of its sightings. If not, create a new defect in Detected. A nightly clean-up job can re-cluster with `ST_ClusterDBSCAN` to merge defects that drifted apart.

&#91;embedded content: Defect lifecycle · 6 states\]

- **Detected to Verified:** automatically after several sightings on different passes, or immediately when a supervisor approves it.
- **Detected to Rejected:** a supervisor marks it as a false detection; its crop becomes a negative training example.
- **Verified to Scheduled:** a work order covering it is approved.
- **Scheduled to Fixed:** the crew or supervisor marks the job done.
- **Fixed to Confirmed:** once the defect's location has been covered by enough scanning passes, about 3 to start, with no matching detection. Coverage, not just time, decides this, so a road nobody drove cannot confirm a fix.
- **Back to Detected:** a matching detection near a fixed or confirmed defect reopens it, with the history kept.

**Coverage.** Road segments for the pilot precinct are loaded once from OpenStreetMap by a developer and split into segments of about 50 m. A segment counts as scanned when an active part of a track passes within about 10 m of it. The dashboard shows segments not scanned within their target interval, daily for main roads and school routes, weekly for quiet streets. Detections outside the pilot precinct are simply not matched to any segment and can be filtered out on the server.

**Urgency score.** A simple, explainable weighted score ranks the repair list:

```latex
\text{urgency} = w_t \cdot \text{type} + w_s \cdot \text{size} + w_l \cdot \text{location} + w_a \cdot \text{age} + w_r \cdot \text{rain}
```

Each term is scaled from 0 to 1: type (a blocked drain or fallen tree scores higher than a faded line), size from the box area, location (near a school, junction or main road), age since first seen, and rain forecast for drains. The weights are set with SDP's maintenance team, not guessed; start with equal weights and adjust. Keeping it a visible formula, not a model, lets supervisors understand why something is at the top.

**Jobs and schedule.** Ingest runs on each upload. Merge runs right after ingest. Urgency recalculates every hour and when the forecast updates. Coverage and repair confirmation run after each track upload and nightly.

## 5. Agent service and dashboard

**Agent service**

The agents turn defects into admin work: drafted jobs, briefs and reports. They read and write only through tools that call the backend, and every output that leaves the system waits for a human.

| Agent | Trigger | Output | Approval |
| --- | --- | --- | --- |
| Work order agent | New verified defects, checked every hour | Draft work orders: description, crew type, grouped nearby defects | Supervisor approves, edits or rejects on the dashboard |
| Daily brief agent | Every morning before the first shift | Summary of new, overdue and confirmed defects, and coverage gaps | None; read-only |
| Escalation agent | A defect on a road already handed to the council | Draft council report with crops and coordinates | Supervisor approves before sending |

**Tools the agents can call**

| Tool | Does |
| --- | --- |
| `get_defects(area, status, since)` | Returns defects with type, location, urgency, sightings and crop links |
| `get_coverage(area, since)` | Returns scanned and missed road segments |
| `group_nearby(defect_ids, radius_m)` | Groups defects into one trip by distance |
| `create_work_order_draft(defect_ids, crew_type, description)` | Saves a draft with status `pending_approval` |
| `create_report_draft(defect_ids, recipient)` | Saves a council report draft |
| `post_brief(text)` | Publishes the daily brief to the dashboard |

**How a run works.** A scheduled job starts the agent with its goal and tool list. The agent calls the language model API with tool calling; the backend executes each tool call and returns results; the loop ends when the agent saves its draft or reaches a step limit. Implement it as a small state machine in Python, or with a framework such as LangGraph.

**Guardrails, enforced in code, not only in the prompt**

- Agents have no tool that sends anything outside the system or changes a defect's status; only approved drafts are acted on.
- Every number, date and location in a draft must come from a tool result; drafts store the defect IDs they cite so a reviewer can check each claim.
- Every agent run is logged with its tool calls and outputs.
- If the language model API is down, defects and maps still work; only drafts are delayed.

**Dashboard modules**

| Module | For | Shows and does |
| --- | --- | --- |
| Live map | Supervisor | Defect pins by type and urgency, crops, sighting history, status |
| Review queue | Supervisor | Unsure detections; answer yes or no with one click; answers become labels |
| Work orders | Supervisor | Agent drafts to approve, edit or reject; job status through to fixed |
| Coverage | Supervisor | Scanned versus missed road segments by target interval |
| Devices | Supervisor | Each phone's live state from heartbeats: scanning, cooling, unreachable |
| Daily brief | Manager | The morning summary from the brief agent |

Built in Next.js with shadcn/ui for layout and components, Bklit charts, and react-leaflet for the map (section 8). The map reads `GET /defects` for the visible area only, so it stays fast as the township grows.

## 6. Training loop and model updates

The first model is trained on the public RDD2022 road damage dataset. After that, labels come from normal use: every supervisor answer on the review queue, and every approval or rejection of a detection, becomes a labelled example.

&#91;embedded content: Training loop · 7 steps, 1 gate\]

1. **Reviews.** Each answered review stores the crop, the detected box, the class and the answer: correct, wrong class, or not a defect.
2. **Dataset builder.** Combines RDD2022 with reviewed Elmina crops. Keeps a fixed held-out set of Elmina examples that is never trained on, so every model is measured against the same test.
3. **Retrain.** Fine-tunes the YOLO model, for example with the Ultralytics training tools, on a GPU machine. Run on demand, such as once a few hundred new labels have built up.
4. **Evaluate.** Compares the new model with the current one on the held-out set, per defect class. **If it does not beat the current model, it is not published.**
5. **Export.** Converts to TensorFlow Lite, records a version ID, and checks speed on the target phone.
6. **Publish.** Sets the version as current in `GET /config`.
7. **Phones update.** At the next shift start, config sync downloads the new model. A phone that fails to load it falls back to the previous model and reports the error in its heartbeat.

**Known limitation.** The loop only learns from defects the model already notices, at least faintly. Defects it misses completely never reach a supervisor. A later "add missed defect" button on the dashboard closes this gap.

**Every sighting records its `model_version`,** so accuracy can be compared across versions and a bad model can be rolled back by publishing the previous version.

## 7. Security, privacy and the end-to-end journey

**Security**

- No authentication during the hackathon. Run the demo on a server whose address is not shared publicly, or on a laptop, and use test data where possible.
- All traffic uses HTTPS.
- Language model API keys stay on the server; no client ever calls the model directly.

**Privacy**

- Video never leaves the phone; frames are analysed in memory and discarded.
- Only defect crops are stored, with faces and number plates blurred on the phone before saving.
- GPS tracks come only from township vehicles on duty.
- No driver performance metrics are computed from tracks or heartbeats; this rule is written into the project.
- Retention periods for crops and tracks, and data ownership, are agreed with SDP and follow Malaysia's personal data protection law.

**A detection's journey, end to end**

1. A patrol car drives past a pothole in the pilot precinct.
2. The sampler passes a frame; the detector finds a pothole with confidence 0.91.
3. The app crops it, blurs anything personal, estimates its position 14 m ahead, and writes a record to the local queue.
4. Not urgent, so the uploader sends it in the next batch a few minutes later.
5. The API stores the sighting and crop; the merge step finds no open pothole within 8 m and creates a new defect in Detected.
6. Two more passes over the next days add sightings; the defect becomes Verified.
7. The work order agent groups it with two nearby defects and drafts a road crew job.
8. A supervisor approves the job on the dashboard; the defect becomes Scheduled.
9. The crew repairs it and marks the job done; the defect becomes Fixed.
10. Three later scanning passes cover the spot without detecting a pothole; the defect becomes Confirmed.
11. If a pothole is detected there again, the defect reopens with its history intact.

**Suggested build order for the hackathon**

1. Detector on recorded footage on a laptop: get the model finding potholes in Elmina video.
2. Backend ingest, merge and the defects table, fed by the laptop pipeline.
3. Dashboard live map with crops and status.
4. Android app running the same model on the phone, uploading to the backend.
5. Repair confirmation and the review queue.
6. Work order agent and daily brief.
7. Coverage and device status, if time allows.

The demo only needs steps 1 to 5 working end to end; the rest can be shown at smaller scale.

## 8. Front end and design

The patrol app and the dashboard share one theme, so they read as one product. The theme lives in two files generated from the same tokens: `globals.css` for the dashboard and `PatrolEyeTheme.kt` for the app.

**Shared tokens**

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| Primary | #171717 | #E5E5E5 | Main buttons, active tab, logo tile |
| Background | #FFFFFF | #0A0A0A | Page and screen background |
| Muted text | #737373 | #A3A3A3 | Labels, captions |
| Border | #E5E5E5 | #2E2E2E | Cards, tables, dividers |
| Status high | #B91C1C | #F87171 | Fix first, check failed, unreachable |
| Status medium | #D97706 | #FBBF24 | Soon, cooling down, awaiting approval |
| Status low | #1D4ED8 | #60A5FA | Low urgency, detected |
| Status done | #15803D | #4ADE80 | Scanning, confirmed fixed, on target |

Fonts: Geist for text, Geist Mono for numbers, IDs and versions. Corner radius 10 px on both. Status colour is always paired with a word or icon, never colour alone.

**Dashboard stack**

| Part | Library | Notes |
| --- | --- | --- |
| Framework | Next.js with React and Tailwind CSS 4 | Matches what shadcn and Bklit target |
| Layout and components | shadcn/ui | Tabs, cards, tables, badges, buttons, sheets, dialogs |
| Charts | Bklit UI, installed through the shadcn registry | Detected vs fixed, stat trends |
| Map | react-leaflet with a dark tile style and marker clustering | Load with `ssr: false`; give the map container `isolation: isolate` so dialogs stay above it |

**Dashboard layout, dark by default**

- **Overview:** a full-screen map as the hero, with floating panels: a pill menu at the top, the morning brief and stats on the left, the selected defect on the right, and the fix-first list at the bottom. Pins glow in status colours against the dark map.
- **Review, Work orders, Coverage, Devices:** solid dark cards and tables. These are working screens where clarity matters more than effect.
- A light theme is available through the same tokens.

**Glass, with a one-switch fallback.** Only the Overview's floating panels use glass, through one shared class:

```css
.panel {
  background: var(--panel-bg);
  backdrop-filter: blur(var(--panel-blur));
  border: 1px solid var(--panel-border);
}
:root {
  --panel-bg: rgb(10 10 10 / 0.68);
  --panel-blur: 12px;
  --panel-border: rgb(255 255 255 / 0.10);
}
.no-glass {
  --panel-bg: #171717;
  --panel-blur: 0px;
  --panel-border: #2e2e2e;
}
```

Blur is re-computed every frame while the map pans, so keep it to a few panels and a small radius. If panning stutters on the slowest test laptop, first switch blur off while the map moves; if that is not enough, add `no-glass` to the page. The layout does not change.

**Patrol app look**

- Kotlin with Jetpack Compose and Material 3, themed by `PatrolEyeTheme`.
- Dark by default: less glare at the windscreen and less screen heat on OLED phones.
- Larger text and 56 dp touch targets, read in a one-second glance; key states labelled in English and Malay.
- Screens: Start shift, Scanning, Cooling down, End of shift, plus a demo mode with detection boxes.

## 9. Testing and demo plan

The system does not depend on where it runs, so the team can test near campus and present it as Elmina.

1. **Real defects nearby.** Drive local roads and car parks with a mounted phone recording, to collect potholes, cracks, faded markings and blocked drains.
2. **Staged, safe defects.** On a quiet road or private car park, with permission: rubbish bags for illegal dumping, a fallen branch, leaves over a drain grate. Never damage a real road. Film before and after removing them to demo repair confirmation.
3. **Replay mode in the app.** The app reads a recorded video and a recorded or simulated GPS track instead of the live camera and GPS; the rest of the pipeline runs unchanged. Tracks can be mapped onto Elmina coordinates for the pitch, stated clearly as test-site footage.
4. **Scenario script.** A script feeds pre-made detections into the backend over a few minutes, as if a week of patrols happened, to show merging, verification, a fix and confirmation in one demo.

| Demo scene | Source | Shows |
| --- | --- | --- |
| Live boxes on video | Replay of a recorded drive | On-phone detection |
| Pins appear on the map | Same replay, uploading | Locating and upload |
| Same pothole on 3 drives becomes one | Scenario script | Merging and tracking |
| Agent drafts a job, supervisor approves | Live on the dashboard | Agents with approval |
| Staged rubbish removed, later drive sees nothing | Before and after footage | Repair confirmation |

**Early check:** run the first recorded drive through the public-data model this week. If it misses most defects, label more local images before the demo.

## 10. Future improvements

**Township boundary setting.** Out of scope for the hackathon. In the pilot the phone scans wherever the vehicle drives, which works because patrol vehicles stay in their precinct, and the server ignores detections that do not match any pilot road segment. Later:

- An admin draws the township outline on a dashboard map, for example with Leaflet-Geoman, and can edit it any time; each save creates a version.
- The phone downloads the current version at shift start and checks its GPS position against it every few seconds, with a buffer of a few tens of metres and a few seconds of dwell so GPS wobble does not flip the state.
- Outside the boundary, frames are neither processed nor stored, which saves heat and battery and keeps private travel out of the data.

The proposal's future improvements section lists the others: resident page, more defect types, motorcycle coverage with record now, process later cameras, and an "add missed defect" button.

**Access control, once SDP adopts the system.**

- **A key per phone:** each patrol phone gets its own secret key, sent with every upload. The server only accepts uploads carrying a valid key, and a lost phone's key can be switched off without touching the other phones.
- **Dashboard logins with roles:** admin, supervisor and viewer.
- **Dedicated phones** locked to the app, not drivers' personal phones.

**If asked: "What if someone uploads false detections?"** Today the system is a prototype without authentication. In a rollout, every upload must carry a phone's own key, so the server rejects anything not sent by a registered patrol phone, and every record shows which phone sent it. A single bad record also cannot create a confirmed defect on its own: defects become verified only after several sightings on different passes, or a supervisor's approval, and every crop is visible for checking.

**Shift records.** Explicit start and end shift records on the server. For now the server groups data by device and time, and the end-of-shift summary is calculated on the phone.