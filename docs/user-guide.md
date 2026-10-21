# Bird Eye v33 user guide

Supervisors use the dashboard. Drivers use the app. To start the system, see [SETUP.md](../SETUP.md).

## Supervisor: the dashboard

### Open it and unlock actions

1. Open http://localhost:3000. Anyone can look. Changes need the action code.
2. Do your first action, such as **Verify**. A box asks you to **Enter the action code**.
3. Type the code. The default is `demo`. It is set by `ACTION_CODE` (see SETUP.md).
4. You stay unlocked until you close the tab or click the lock icon in the top menu.

If the box says "Actions are off on this deployment", no code is set. Set `ACTION_CODE`.

The top menu has three pages: **Overview**, **Review** and **Work orders**.

### Overview

The map shows defects as pins. The colour is urgency:
- **Fix first**: high.
- **Soon**: medium.
- **Low**: low.

The three buttons on the left pick which defects the map shows:
- **to check**: detected, not yet looked at.
- **waiting for job**: verified, not yet in a work order.
- **in a job**: scheduled in an approved work order.

Each button shows a count. The **Most urgent** list shows the top defects of the chosen stage. Use the arrows by the map to step through it.

The **Morning brief** card shows the time and first line of the daily brief. Click it to see every line. It says "No brief yet." until an agent writes one.

To open a defect, click its pin or its row in the list. The side panel shows:
- the photo, and what to do next;
- **Why it ranks here**;
- the location (click the copy icon to copy it), first seen and last seen;
- the history of its sightings.

### Verify a defect

1. Open a defect in **to check**. Look at the photo.
2. Click **Verify** if it is real. It moves to **waiting for job**.
3. Click **Not a defect** if it is not. Confirm. It leaves the map, and its photo is kept as an example of what is not a defect.

A defect also becomes verified by itself after it is seen on 3 separate passes. A pass is a visit at least 60 minutes after the last one.

### Review

**Review** lists detections the phone was unsure about. They do not become defects until you answer. The title shows how many are waiting.

Each card shows the photo, the type guess with its confidence, the location and when it was seen. Tabs filter by type guess. You have three answers:
- **Yes, defect** (key Y): the guess is right. It joins a defect.
- **Wrong type** (key T): pick the right type. It joins a defect with that type.
- **Not a defect** (key N): the photo is kept as an example of what is not a defect.

A box asks you to confirm each answer.

### Work orders

An agent drafts work orders from verified defects. It runs only when someone starts it (see SETUP.md, section 2). Drafts appear on **Work orders** under the **Pending** tab.

1. Click a row to open the job.
2. Read the **Agent's description** and the **Defects cited**.
3. To change it, click **Edit**. Change the description or crew type, or untick defects. Click **Save changes**. A job needs at least one defect.
4. Click **Approve** and confirm. Its defects become **in a job**.
5. Click **Reject** and confirm to set the draft aside. Its defects do not change.

Nothing goes to a crew without your approval.

### Mark fixed

1. When the crew finishes, open one of the job's defects in **in a job**.
2. Click **Mark fixed**. A box asks **Mark job done?** It names every defect in the job.
3. Click **Mark job done**. All of them become Fixed. You can also click **Mark done** on the job in **Work orders**.

After that, later patrols pass the spot. After 3 clean passes on at least 2 days, the defect is Confirmed. If a patrol sees it again, it reopens with its history. Clean passes are recorded only through a test route today, so real driving does not confirm repairs yet.

## Driver: the app

### Start shift

1. Fix the phone in the mount, facing the road ahead. Plug in the charger.
2. Open the app. It checks: **Camera permission**, **Location permission**, **GPS**, **Charging** and **Mount tilt**. Each shows **Pass**, **Warning** or **Fail**.
3. If a permission fails, tap **Allow camera and location**. If GPS says "Searching for GPS", wait a minute.
4. When all pass, tap **Start shift**.

### Scanning

The screen says **Scanning** and shows three counters: **Defects today**, **Records waiting** and **Uploads completed**. Do nothing. Just drive. The app watches the road, saves the defects it finds, and uploads them when it has a connection.

### End of shift

1. Stop the vehicle. The **End shift** button stays off until the phone has been still for 10 seconds. It also turns on after 30 seconds with no GPS.
2. Tap **End shift**. The **End of shift** screen shows **Defects found**, **Uploads completed** and **Distance**.
3. Tap **New shift** for the next one.

Records not yet sent stay on the phone. They upload when a connection is available, with retries, even after the shift ends.

### Replay mode

For demos without driving, the app can play a recorded video. See SETUP.md, section 4.

## If something looks wrong

- Empty map: the backend is not running, or has no data. The page says "Can't reach the server." Check SETUP.md.
- No new pins: the phone has not uploaded yet. Check **Records waiting** in the app and the network.
- Actions locked: set `ACTION_CODE` and restart (see SETUP.md).
- No work orders or brief: the agents have not run. Run them (SETUP.md, section 2).
