# Setup

Run one route at a time. The Docker route and the manual route share ports 8000 and 5432 and the same database volume.

## Before you start (Docker route)

Install Docker first. Only Linux was tested.

- **Linux:** install Docker Engine and the Compose plugin from [docs.docker.com](https://docs.docker.com/engine/install/). If you get "permission denied", put `sudo` in front of each `docker` command. Or add yourself to the `docker` group and log in again.
- **macOS:** install Docker Desktop. Start it and wait until it says it is running. Then use that terminal.
- **Windows:** install Docker Desktop with WSL 2. Start it. Use PowerShell, and type `copy` instead of `cp` later on.

Then run `docker compose version` in a terminal. If it prints a version, Docker is ready. If it fails, fix that before step 1. Compose v5.6.0 was tested.

## Env files

Which file holds your keys depends on the route.

**Docker route:** use only `backend/.env`. Put all four values there:
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `NEXT_PUBLIC_CARTO_KEY`
- `ACTION_CODE`

Docker ignores `dashboard/.env.local`. After you change `NEXT_PUBLIC_CARTO_KEY`, run `docker compose up --build -d` again.

**Manual route:** use two files.
- `dashboard/.env.local`: `NEXT_PUBLIC_CARTO_KEY` and `ACTION_CODE`.
- `backend/.env`: `GEMINI_API_KEY` and `GEMINI_MODEL`.

## 1. Docker route (recommended)

It starts the database, the backend and the dashboard with invented data.

```bash
cd backend
cp .env.example .env     # optional, only for keys. On Windows: copy .env.example .env
```

Open `backend/.env` and fill in only what you need:

- `GEMINI_API_KEY` and `GEMINI_MODEL`: only for the agents (section 2).
- `NEXT_PUBLIC_CARTO_KEY`: only for the map tiles. Get a free key at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey).
- `ACTION_CODE`: the code that unlocks dashboard actions. The default is `demo`.

Start it:

```bash
docker compose up --build -d
```

The first build takes a few minutes. Then check it:

```bash
curl "localhost:8000/defects?bbox=-180,-90,180,90"
```

You should see a list of 15 defects. Open http://localhost:3000 for the dashboard. The API is at http://localhost:8000.

The map works without `NEXT_PUBLIC_CARTO_KEY`, but the tiles show an "API key required" watermark. The key is built into the dashboard. After you change it, run `docker compose up --build -d` again.

On the first start the backend loads invented data. It does this only when the database has no defects, so a restart does not add more.

Stop it:

```bash
docker compose down
```

Clean start (deletes the database and the saved crops):

```bash
docker compose down -v
```

## 2. Agents (optional)

Needs `GEMINI_API_KEY` and `GEMINI_MODEL` in `backend/.env`. Agents run only when you start them. They save drafts and change nothing else.

```bash
docker compose up -d     # after editing .env
docker compose exec backend python -m bird_eye.agents work-order
docker compose exec backend python -m bird_eye.agents brief
```

- `work-order` drafts work orders from verified defects. Check them on the Work orders page.
- `brief` drafts the daily brief.

Without keys, each command prints `GEMINI_API_KEY is not set`. A run with a working key was not tested.

## 3. Manual route (skip to 4. if you run with docker)

For people who edit code. Needs [Docker](https://docs.docker.com/get-docker/) for the database, [uv](https://docs.astral.sh/uv/) and [Node.js](https://nodejs.org) 20.9 or later.

Install uv, then open a new terminal and check `uv --version`. Use uv 0.12 or later. uv downloads Python 3.14 for you.

```bash
pip install uv     # or: curl -LsSf https://astral.sh/uv/install.sh | sh
```

On recent Ubuntu or Debian, use `pipx install uv` instead of `pip`. On Windows, use `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`.

Backend, in a first terminal:

```bash
cd backend
docker compose up -d db
uv sync
uv run alembic upgrade head
uv run python scripts/seed.py
BIRDEYE_DEV_ENDPOINTS_ENABLED=true uv run uvicorn bird_eye.main:app --host 0.0.0.0 --port 8000 --reload
```

Shortcut: `python3 dev.py` runs the same steps, and resets the dev data first. It wipes the dev data on every run. On the very first run the database may not be ready yet. If it fails with a connection error, run it again. The Windows `cmd` is not supported, because the last line sets the variable in Linux style. Tested on Linux only.

Dashboard, in a second terminal:

```bash
cd dashboard
cp .env.example .env.local
npm install
npm run dev
```

Edit `dashboard/.env.local` before `npm run dev`. Each variable has a comment. You need two changes, and the map key is optional:

- Set `NEXT_PUBLIC_API_MODE=real`. The default `mock` uses invented data in the browser and never calls the backend.
- Set `ACTION_CODE` to any word, for example `demo`. Empty means every action stays locked.
- Optional: set `NEXT_PUBLIC_CARTO_KEY` for the map tiles.
- For the agents, copy `backend/.env.example` to `backend/.env` and fill in the Gemini keys.

Open http://localhost:3000. Restart `npm run dev` after any change to `.env.local`.

Run these before you push:

```bash
npm run lint
npm run build
```

## 4. Phone app

Needs [Android Studio](https://developer.android.com/studio). It includes the JDK and the Android SDK.

### 4.1 First time

1. In Android Studio, choose **Open** and select the `eagle` folder, not the repo root.
2. Wait for the Gradle sync. The first one downloads Gradle 9.6.0 and can take several minutes. Use a version of Android Studio that supports Android Gradle plugin 9.4.1.
3. Copy `eagle/local.properties.example` to `eagle/local.properties`. This file is for this machine only.
4. Turn on USB debugging on the phone. See [section 5](#5-turn-on-usb-debugging) if you do not know how.
5. Plug the phone into the laptop with a USB cable. Tap **Allow** if the phone asks.
6. Install the app. Use one of these:
   - Press **Run** in Android Studio.
   - Or run this in a terminal in the `eagle` folder (the Terminal tab in Android Studio works):

Linux and macOS:

```bash
./gradlew installDebug
```

Windows:

```powershell
.\gradlew installDebug
```

After this the app stays on the phone. You can open it with no laptop and no cable.

### 4.2 After the install

The app is now on your phone. Open it and try it.

It starts in mock mode. This is the default `birdeye.api=mock` in `eagle/local.properties`. The app uses fake data and sends nothing, so it needs no backend and no laptop.

To send detections to your backend (4.3) or to use a recorded video (4.5), change `eagle/local.properties`. Then install again, with **Run** button in andriod studio or `./gradlew installDebug` in terminal (the command is according to your operating system). The app copies these settings when it is built. If you only edit the file and reopen the app, the app still uses the old settings.

### 4.3 Send detections to your backend

The app now runs in mock mode. Follow these steps to make it send its detections to your backend instead.

Before you start, run the backend on the laptop (section 1 or 3). The phone and the laptop must be on the same Wi-Fi or hotspot.

1. Find the laptop IP:
   - Linux: `hostname -I` or `ip addr`.
   - macOS: `ipconfig getifaddr en0`.
   - Windows: `ipconfig`.

   Use the Wi-Fi or hotspot address, such as `192.168.x.x`. Ignore `127.0.0.1` and `docker0` (`172.17.x.x`).
2. Check that the phone can reach the backend. Open this in the phone's browser:

```
http://<laptop-ip>:8000/docs
```

3. Open `eagle/local.properties` and set these three lines:

```
birdeye.api=real
birdeye.baseUrl=http://<laptop-ip>:8000
birdeye.deviceId=car-01
```

4. Install again (4.1 step 6). The new settings only reach the phone with a new install.


### 4.4 Replay mode

The app now uses the phone's camera and GPS. Follow these steps to test with a recorded video instead. The app then plays your video and an invented GPS line.

Before you start, have a video named `replay.mp4` in your `Downloads` folder on the laptop. Footage is never committed, so use your own. Keep the phone plugged in with USB debugging on.

1. Open `eagle/local.properties` and set this line:

```
birdeye.replay=true
```

2. Install again (4.1 step 6). The new setting only reaches the phone with a new install.
3. Copy the video to the phone. Put `replay.mp4` in your `Downloads` folder, then run the command for your system. The first path is the video on the laptop. The second path is on the phone, so leave it as it is.

Linux:

```bash
~/Android/Sdk/platform-tools/adb push ~/Downloads/replay.mp4 /sdcard/Android/data/com.birdeye/files/replay.mp4
```

macOS:

```bash
~/Library/Android/sdk/platform-tools/adb push ~/Downloads/replay.mp4 /sdcard/Android/data/com.birdeye/files/replay.mp4
```

Windows PowerShell:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" push "$env:USERPROFILE\Downloads\replay.mp4" /sdcard/Android/data/com.birdeye/files/replay.mp4
```

`adb` is part of the Android SDK. If the path is wrong on your machine, find it in Android Studio under **Settings > Languages & Frameworks > Android SDK**.

4. Open the app. It shows **REPLAY** and plays the video. If it says `replay.mp4 not found`, the file is in the wrong place. Push it again.
5. Optional: for your own GPS line, push a `replay_track.json` to the same folder. Without it the app uses a straight line.

You copy the video once. It stays on the phone, so the next runs need no laptop. To use the real camera again, set `birdeye.replay=false` and install again.

## 5. Turn on USB debugging

The phone needs this before the laptop can install the app. The menu names differ a little on each phone.

1. Open **Settings > About phone**.
2. Tap **Build number** 5 or 7 times. The phone says you are a developer. On some phones it is under **Software information**.
3. Go back to **Settings > System > Developer options**.
4. Find an turn on **USB debugging**.

## 6. Troubleshooting

- Port in use: stop the other route first, or run `docker compose down`.
- Phone cannot connect: use the laptop IP, not `localhost`, and check the firewall and the Wi-Fi.
- Empty map: the pins need the backend. In manual mode, check `NEXT_PUBLIC_API_MODE=real`. Tiles with a watermark only need `NEXT_PUBLIC_CARTO_KEY`.
- Agents error: `GEMINI_API_KEY is not set` means the key is missing in `backend/.env`. Run `docker compose up -d` again after you edit it.
- Windows: if the backend container exits at once, `docker-entrypoint.sh` may have Windows line endings. Delete the folder and clone the repo again with `git clone`. `.gitattributes` then fixes it.
