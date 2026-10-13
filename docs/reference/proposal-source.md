# Patrol Eye: Hackathon Proposal

Oct 11, 2026 · @SL

## Summary

Patrol Eye turns the vehicles that already patrol a Sime Darby Property township into a daily road and drain inspection network. A phone mounted in each patrol or service vehicle detects potholes, blocked drains, broken street lights, fallen trees and illegal dumping as it drives. AI on the phone finds the defect, and only a small record is sent to a backend that merges sightings, tracks each defect over time and confirms repairs without anyone filing a report.

**Hook:** every road in the township is inspected every day, by vehicles that were driving it anyway.

| Item | Detail |
| --- | --- |
| Track | People |
| Sub-track | Safety and security (secondary: getting around) |
| Pilot site | One precinct of City of Elmina |
| Main user | SDP township operations and maintenance team |
| Prototype | Android app with on-device AI, backend, live map dashboard |

We submit under People rather than Planet because most detected defects affect whether residents move around safely, especially at night. Blocked drains before storms are a strong secondary benefit.

## Problem

Road and drain defects are found late because they are found by people noticing and complaining, not by systematic daily inspection. A pothole, a dark street light or a drain choked with debris can sit for days before anyone reports it, and the person who finds it first is often the one who gets hurt.

**For residents**

- Motorcyclists are the most exposed to potholes and debris, especially at night.
- Pedestrians, children and elderly residents walking after dark depend on working street lights.
- Blocked drains raise flash flood risk during heavy afternoon storms. Shah Alam saw severe flooding in December 2021, and the High Court later found the city council negligent over drain maintenance in Taman Sri Muda ([NST](https://www.nst.com.my/amp/news/nation/2026/10/1546520/nst-court-watch-taman-sri-muda-floods-zayn-rayyan-appeal-headline-week)).

**For Sime Darby Property**

- City of Elmina covers 6,500 acres and is planned for 36,000 homes and 150,000 residents by around 2040, with about 26% complete ([PropertyGuru](https://www.propertyguru.com.my/property-for-sale/at-elmina-green-four-17552/with-studio)). Road length grows with every new phase.
- Manual inspection does not scale with that growth, and complaint-driven repair means SDP learns about problems from angry residents.
- Residents already voice strong frustration about township infrastructure, mainly traffic ([Focus Malaysia](https://focusmalaysia.my/lack-of-planning-foresight-leads-to-city-of-elminas-traffic-woes-stretches-far-and-wide-beyond-township/)). Visible neglect of roads adds to that pressure on the brand.

**Open question for mentors:** how SDP finds road and drain defects today, and how long a typical repair takes. These two numbers are the baseline this proposal is measured against.

## Solution

Patrol Eye inspects every road as a side effect of routine patrols, so nobody has to remember, report or upload anything.

&#91;embedded content: Patrol Eye flow · detect, track, repair, confirm\]

Detection happens on the phone; the backend holds each defect's history, and later patrols close the loop by confirming the repair.

**Mechanism**

1. A dedicated Android phone sits in a fixed mount in each selected patrol or service vehicle, powered by the car charger.
2. As the vehicle drives, an AI model on the phone checks a few frames per second for potholes, blocked drains, broken street lights, fallen trees and illegal dumping.
3. When it finds one, it saves a small record: a cropped image of the defect, the GPS location and the time. Faces and number plates in the crop are blurred on the phone.
4. Records upload over mobile data if urgent, such as a fallen tree blocking a road, and otherwise sync over WiFi at the end of the shift.
5. The backend merges sightings of the same defect within a few metres into one defect record and ranks defects by urgency.
6. The maintenance team sees a live map, schedules repairs and marks them done.
7. After a repair, if vehicles pass the spot repeatedly without detecting the defect, the system confirms the fix. If it reappears, the record reopens automatically.

**Defect status:** detected, verified, scheduled, fixed, confirmed.

Residents are out of scope for the hackathon prototype. They benefit indirectly through faster repairs and safer streets; a resident page is listed under future improvements.

**Coverage without a camera on every vehicle**

Patrol Eye does not need every vehicle equipped. It needs enough equipped vehicles to see every road as often as it matters. An illustrative estimate, using assumed figures to be verified: a 300 km road network, 100 km driven per vehicle per shift, and 50% of that on roads not already covered by others.

```latex
\text{Vehicles needed for daily coverage} = \frac{300\ \text{km}}{100\ \text{km} \times 0.5} = 6
```

Choosing which vehicles to equip is a set cover problem: the smallest set of routes that together cover every road at the required frequency. Main roads and school routes can be covered daily, quiet cul-de-sacs weekly.

**Locating each defect on the map**

Every detection carries coordinates, so each defect appears as a pin on the dashboard. Three steps make the pin more accurate than a raw GPS reading:

1. **Project ahead of the vehicle.** The camera sees a defect 10 to 20 metres ahead, not under the vehicle. The system offsets the pin by the estimated distance d along the vehicle's heading θ, then converts that offset into latitude and longitude.
2. **Snap to the road.** Phone GPS is typically accurate to a few metres in open sky and worse near buildings and trees. Each pin is matched to the nearest road segment from OpenStreetMap.
3. **Average many sightings.** The same pothole seen on 20 passes gives 20 slightly different positions; their average is far more precise than any single reading.

```latex
\text{defect position} = \text{vehicle position} + d \cdot (\sin\theta,\ \cos\theta)
```

Each pin shows the defect type, cropped photo, coordinates, first seen date, number of sightings, status and repair history.

**Vehicles, mounting and heat**

The pilot uses cars and vans only. Malaysian heat and engine vibration make phones unreliable on motorcycles and bicycles, which have no air conditioning; those are handled later with different hardware.

- **Mounting:** the phone sits on an air conditioning vent mount, which keeps it cooler and out of direct sun, powered by the car charger.
- **Less heat at source:** the screen stays dim or off while scanning, and the model only checks a few frames per second.
- **Handled without the driver:** the driver cannot fix an overheating phone mid-route, so the app does not alert them. It first scans fewer frames per second, then pauses, then resumes automatically when cool.
- **Nothing silently lost:** the app records which road segments it actually scanned. The dashboard shows coverage gaps, and those roads get priority on the next patrol.
- **Supervisor view:** each phone sends a small heartbeat every minute. If a phone stays down for long, its vehicle shows as offline on the dashboard.
- **Heat test first:** before the pilot, run the app for two hours in a parked and a moving vehicle in midday sun, logging the phone's temperature every minute.

If a township's patrols are mostly motorcycles, the design changes to record now, process later: an outdoor-rated action camera records video only, uploads over WiFi at the end of the shift, and the server runs the AI. Defects then appear the same day rather than live.

**Patrol app experience**

Drivers never need to touch the app while moving. It has three screens and a demo mode:

1. **Start shift:** the one screen the driver touches. The app checks itself (camera, GPS, charging and mount angle), then the driver taps start. A horizon line on the camera preview helps line up the mount.
2. **On shift:** readable in a one-second glance: scanning status, defects found today, records waiting to upload. The screen dims to reduce heat.
3. **End of shift:** distance, defects found, uploads completed, and a reminder to sync over WiFi.
4. **Demo mode:** a live camera view with boxes drawn around detected defects, used for the pitch and testing only.

The app is built in Kotlin with Jetpack Compose, using large controls, few words, and Malay and English labels. Device setup, such as assigning a phone to a vehicle, is done by an admin behind a PIN.

&#91;embedded content: Patrol app flow · one shift\]

Only confident and unsure detections leave the phone; everything else is discarded on the device.

## Technology

The enabler is on-device AI on a standard phone, paired with a geospatial backend that tracks each defect over time. The phone already contains the camera, GPS, processor, connectivity and battery, so the pilot needs no custom hardware. The software is device-independent, so the phone can later be swapped for a dashcam with a small computer or a commercial AI dashcam without changing the backend.

| Layer | Choice | Reason |
| --- | --- | --- |
| Device | Mid-range Android phone in a fixed mount | Android lets a dedicated app keep the camera running |
| Phone app | Kotlin with Jetpack Compose and CameraX | Direct camera and on-device AI control; modern UI |
| On-device AI | YOLO object detection exported to TensorFlow Lite | Fast enough to run on a phone |
| Training data | First model: public road damage dataset (RDD2022). Later: supervisor approvals and unsure detections | Improves on local roads through normal use, without ongoing manual labelling |
| Privacy on device | Upload only the defect crop; blur faces and plates | No personal data reaches the server |
| Local storage | SQLite with a background upload job | Store and forward when signal is weak |
| Backend | Python with FastAPI | Pairs naturally with the AI code |
| Database | PostgreSQL with PostGIS | Merges detections by location; tracks history |
| Dashboard | React with Leaflet map | Live map, approvals, device status, coverage gaps |
| Hosting | One cloud server or Supabase | Fast to set up for a pilot |

**Data volume.** Uploading video would be wasteful. At roughly 10 megabits per second, one hour of 1080p video is about 4.5 GB. Patrol Eye sends only detection records of a few kilobytes each, so daily data stays in megabytes.

**Core logic we build**

- Merge duplicates: detections of the same type within a few metres become one defect, using PostGIS clustering.
- Track over time: each defect keeps its list of sightings; more sightings raise confidence, and a growing detected size suggests it is getting worse.
- Confirm repairs: repeated passes with no detection after a repair confirm the fix.
- Rank by urgency: defect type, size, location near schools or main roads, and forecast rain for drains.

**AI agent layer**

The detection models produce the facts; LLM agents handle the work around them. Each agent takes over a real chore, calls tools to read the database, and never acts alone where it matters.

| Agent | Chore it takes over | Human approval |
| --- | --- | --- |
| Work order agent | Turns new defects into repair jobs: writes the description, picks the crew type (road, electrical, drainage, landscape), groups nearby defects into one trip | Supervisor approves or edits each job |
| Escalation agent | For roads already handed to the council, drafts a report with photos and coordinates | Supervisor approves |
| Daily brief agent | Morning summary for the manager: new defects, overdue repairs, repairs confirmed | None; read-only |

**Guardrails**

- Agents never invent numbers, dates or locations; every fact comes from the database through tools.
- Nothing reaches crews or the council without a supervisor's approval.
- Every agent action is logged and visible to SDP.

**Agent stack:** a language model API that supports tool calling; orchestration as a simple state machine or a framework such as LangGraph; tools for querying defects, creating jobs, sending approved messages and drafting council reports.

**Training data loop**

The first model is trained on RDD2022, a public road damage dataset of 47,420 road images from six countries (Japan, India, the Czech Republic, Norway, the United States and China). Most images were taken from cameras mounted in vehicles, which is the same view as the patrol phone. Training uses PyTorch, and the trained model is converted once to TensorFlow Lite (LiteRT) to run on the phone. The first model uses two classes, pothole and crack, because the maintenance team needs fix-first decisions, not crack types. After that, the model improves from normal use rather than ongoing manual labelling.

| Confidence | What happens |
| --- | --- |
| High, for example above 0.8 | Treated as a real defect and sent to the dashboard |
| Low, for example below 0.3 | Ignored, likely a shadow or stain |
| In between | Saved as unsure and sent to a supervisor to answer yes or no |

Every supervisor approval or rejection becomes a labelled example. The unsure cases are the most valuable, because they are exactly what the model finds confusing. The thresholds are examples to tune during testing: a wide unsure band floods supervisors with reviews, a narrow one slows learning. Because the first model comes from other countries' roads, expect more unsure detections in the early weeks.

**Known limitation:** the loop only learns from defects the model already notices, at least faintly. Defects it misses completely never reach a supervisor. A later fix is an "add missed defect" button for staff. Any image used for training has faces and plates blurred, and data ownership is agreed with SDP.

**What we claim and what we do not claim yet.** We report accuracy on RDD2022's own test split. We do not claim an accuracy figure for Malaysian roads, because the model has not been tested on them. RDD2022 contains no Malaysian images, so local accuracy will probably be lower until local data is added. Measuring it on Malaysian roads is the first task of the pilot. Drains are not covered by the first model: no public dataset labels drain defects, so drain detection needs its own labelled images and is a pilot extension.

## Beneficiaries and impact

The main user and payer is SDP's township operations team; residents benefit indirectly from safer streets and faster repairs.

| Beneficiary | Benefit |
| --- | --- |
| SDP township operations team | Finds defects without manual inspections or waiting for complaints; repairs ranked by urgency |
| Motorcyclists | Fewer unseen potholes and debris, the hazards they are most exposed to |
| Pedestrians, children, elderly | Broken street lights and path hazards fixed faster, especially for night walks and school routes |
| Residents (indirect) | Faster repairs and safer streets; a resident page is a future improvement |
| SDP brand and sales | A visibly maintained township supports property value and future launches |
| Local council | Defect history can be handed over with the roads |

**Impact metrics for the pilot.** We will not claim impact numbers before measuring. The pilot compares these against SDP's current baseline:

| Metric | What it shows |
| --- | --- |
| Time to detect a defect | How much earlier than complaint-driven discovery |
| Time to repair | Whether urgency ranking speeds up fixes |
| Defects found vs complaints received | How many problems were invisible before |
| Road length covered per week | Share of the township checked |
| Repairs confirmed automatically | Whether fixes held |
| Resident complaint volume over time | Whether residents notice the difference |

**Honest scope.** Patrol Eye improves daily safety and maintenance quality. It does not transform residents' lives on its own. Its strongest case is operational: earlier, cheaper and more complete maintenance across a township that keeps growing.

## Feasibility and pilot plan

Patrol Eye can be piloted in one Elmina precinct within three months, using vehicles that already drive there and no new infrastructure.

**Why it is feasible**

- It uses vehicles SDP's township already runs, so no new routes or staff.
- The device is an off-the-shelf phone, so no custom hardware.
- Detection works offline; uploads need only brief connection.
- The backend and dashboard are standard software our team can build and maintain.
- The first model needs no data collection. It trains on a public dataset (RDD2022), and local accuracy is built during the pilot from supervisor approvals and rejections.
- It runs inside the area SDP is responsible for before handover.

**Pilot in four phases**

1. **Setup (weeks 1 to 2):** confirm which cars and vans patrol the pilot precinct, mount phones on vent mounts, and run the two-hour heat test.
2. **Shadow run (weeks 3 to 6):** Patrol Eye runs alongside current inspection. The first task is measuring accuracy on Malaysian roads: the team checks every detection, and those checks become the first local training data.
3. **Live run (weeks 7 to 10):** the maintenance team uses Patrol Eye's urgency ranking to schedule repairs and approves agent-drafted work orders.
4. **Review (weeks 11 to 12):** compare pilot metrics against the baseline and decide whether to extend.

**Success criteria to agree with SDP before starting**

- Detection accuracy acceptable to the maintenance team, measured in the shadow run.
- Defects detected earlier than they would have been reported.
- No phone failures that lose more than one shift of data.
- No privacy complaint from residents or drivers.

## Commercial value, cost and scalability

Hardware for a 10-vehicle pilot costs roughly RM8,000, and the value comes from earlier repairs, less manual inspection and a better-maintained township. Prices below are estimates to be checked before the pitch.

| Item | Estimate per vehicle |
| --- | --- |
| Mid-range Android phone | RM600 to RM800 |
| Mount and car charger | RM50 to RM100 |
| Mobile data | Small, since only kilobyte records are sent |

```latex
10 \times \text{RM}800 \approx \text{RM}8{,}000
```

**Where the value comes from**

- Fewer staff hours spent on manual road and drain inspection.
- Smaller, cheaper repairs, because defects are caught before they grow.
- Lower risk of flood damage and injury from blocked drains and potholes.
- Fewer escalated complaints and a stronger maintenance reputation for future launches.

The comparison only becomes convincing with SDP's own figures: what it spends on inspection today and what a typical late repair costs. We will ask mentors for both.

**Scalability**

| Level | Verdict | Reason |
| --- | --- | --- |
| Within one township | High | A handful of devices covers all roads, chosen by route coverage |
| Across SDP townships | High | SDP has around 25 active townships and developments ([SDP](https://simedarbyproperty.com/node/1433)); one backend serves all, with a small retraining effort per township |
| Beyond SDP | Medium to high | Other developers and local councils face the same problem |
| After roads are handed to the council | Low unless the council joins | SDP's responsibility, and its reason to pay, ends at handover |

The main limits to scale are organisational, not technical: the handover to the council, and whether the maintenance team can act on more detected defects. Urgency ranking addresses the second; a data handover partnership with the council addresses the first.

**If SDP needed hundreds of devices,** a bulk-purchased commercial AI dashcam would replace the phone. The backend and dashboard stay the same.

## Differentiation, privacy and risks

Road-defect AI from dashcams already exists commercially, so our difference is how the data is collected and what happens after: zero-effort coverage from vehicles already on patrol, tracking of each defect over time, and automatic confirmation that repairs held.

**How it differs from other likely entries**

- Most smart-township maintenance ideas rely on residents taking photos and filing reports. Patrol Eye needs no reporting.
- Most defect maps are snapshots. Patrol Eye tracks each defect across hundreds of passes, so it sees deterioration and confirms repairs.
- Coverage is planned, not hoped for: the smallest set of vehicles that covers every road at the required frequency.

**Privacy**

- No video leaves the phone; only cropped defect images, location and time.
- Faces and number plates are blurred on the device before upload.
- Vehicles stay mainly inside the township, so no private travel is recorded.
- A firm rule that the data is never used to monitor drivers' or residents' behaviour.
- What is stored is published in plain language, and the design follows Malaysia's personal data protection law.

**Risks and mitigations**

| Risk | Mitigation |
| --- | --- |
| Model misses Malaysian road and drain patterns | Start from RDD2022 and claim no local accuracy until measured; measure it on Malaysian roads in the first pilot weeks; supervisor approvals and unsure detections then improve it; drains wait for their own labelled data |
| Phones overheat in hot vehicles | Cars and vans only for the pilot; vent mounts; automatic slow-down, pause and resume; missed roads rescheduled; two-hour heat test first |
| Patrol vehicles run by contractors | Arrange mounting through SDP's contracts; confirm early with mentors |
| SDP already has a good inspection system | Ask mentors first; if so, reposition as a complement or drop the idea |
| Maintenance team overwhelmed by more defects | Urgency ranking so the team works on what matters first |
| Drivers feel monitored | No driver metrics collected; rule stated in writing |
| Training dataset licence | Confirm RDD2022 terms allow our use |

**Likely judge question: "What if someone uploads false detections?"** The hackathon prototype has no authentication, to keep the build focused. In a rollout, every patrol phone gets its own secret key sent with every upload, so the server rejects anything not sent by a registered phone, and a lost phone's key can be switched off on its own. A single bad record also cannot create a confirmed defect: defects are verified only after several sightings on different passes or a supervisor's approval, and every crop is visible for checking. Dashboard logins with roles are added at the same stage.

## Look and feel

The patrol app and the dashboard share one theme, so judges see one product: the same near-black and neutral palette, Geist and Geist Mono fonts, 10 px corners, and one status colour language. Red means fix first, amber means soon or cooling down, blue means detected, green means scanning or confirmed fixed, in both the app and the dashboard.

- **Dashboard:** dark by default. The Overview is a full-screen map with floating glass panels for the morning brief, stats, selected defect and fix-first list; the working pages (Review, Work orders, Coverage, Devices) use solid panels for clarity. Built with shadcn/ui, Bklit charts and react-leaflet. If glass slows the map, one switch turns the panels solid without changing the layout.
- **Patrol app:** dark by default for use in vehicles, with large text, 56 dp buttons and English and Malay labels on key states.

**Demo approach.** Footage is recorded near campus, including safely staged defects, then replayed through the real pipeline on stage, with a scenario script compressing a week of patrols into minutes. Test-site footage is labelled as such.

## Future improvements

The pilot proves the loop with phones; later stages improve the hardware, widen what is detected and connect to systems SDP and the council already use.

| Improvement | What it adds | When it makes sense |
| --- | --- | --- |
| Commercial AI dashcams | Rugged, heat-tolerant devices built for all-day use, managed centrally | Once the fleet grows beyond a few dozen vehicles |
| Small edge computer with a fixed camera | Higher resolution and faster detection than a phone; no heat or battery issues | If phones prove unreliable in heat or vibration |
| Rugged action cameras on motorcycles | Withstands vibration and rain better than phones | If phone cameras degrade on motorcycles |
| More vehicle types | Shuttles, maintenance vans and rubbish lorries add coverage at no extra trips | After the pilot shows which routes are under-covered |
| More defect types | Faded road markings, overgrown verges, illegal signage, damaged footpaths, fallen fences | As labelled data grows |
| Night detection of street lights | Night patrols record which lights are out, pole by pole | Once night footage is labelled |
| Resident page | Residents see repair status near their home inside SDP's existing app, with an assistant answering status questions | After the pilot, with SDP's digital team |
| Council data handover | Defect history and coordinates passed to the council with the roads at handover | When roads in a phase are handed over |
| Contractor quality view | Shows which road sections fail repeatedly after repair, by contractor | After enough repair history builds up |

Each step reuses the same backend, database and agents; only the device or the defect list changes.

Also planned: an "add missed defect" button so the model learns from defects it never detected, and motorcycle coverage using outdoor-rated cameras in record now, process later mode.

**Township boundary setting.** Out of scope for the hackathon. In the pilot the phone scans wherever the vehicle drives, which works because patrol vehicles stay in their precinct, and the server ignores detections that do not fall on a pilot road. Later, an admin draws and edits the township outline on the dashboard map, phones download it at shift start, and frames outside it are neither processed nor stored, saving heat and battery and keeping private travel out of the data.

## Prototype, assumptions and next steps

The demo replays a real drive through an Elmina road and shows defects appearing on the map live, merging, and a repair being confirmed on a second drive.

**Prototype scope**

- Android app running the detection model on recorded and live camera input.
- Backend that merges detections, tracks history and ranks urgency.
- Web dashboard with the live map, agent-drafted work orders for approval, device status and coverage gaps.

**Demo script**

1. Play footage of a drive through an Elmina road; detections pop up on the map as it plays.
2. Show the same pothole seen on three drives merging into one record with three sightings.
3. Mark it repaired, play a later drive with no detection, and show the status change to confirmed.
4. Show the urgency ranking putting a blocked drain first on a day with forecast rain.

**Assumptions to verify**

- [ ] Which vehicles patrol or service the pilot precinct daily, how many, and who operates them
- [ ] How SDP finds road and drain defects today, and typical time to repair
- [ ] Road network length of the pilot precinct and of City of Elmina
- [ ] Phone and mount prices at time of pitch
- [ ] Mobile coverage gaps in the pilot precinct
- [ ] RDD2022 dataset licence terms
- [ ] Phone heat performance after one to two hours in a parked and moving vehicle

**Next steps before the 23 October submission**

- [ ] Ask mentors the first two assumption questions
- [ ] Record a few minutes of demo footage with a mounted phone (no labelling needed)
- [ ] Train the first model on RDD2022 (two classes), convert it to TensorFlow Lite, and check it runs at 3 frames per second on the cheapest team phone
- [ ] Build the merge and tracking logic on PostGIS
- [ ] Build the dashboard and rehearse the demo script