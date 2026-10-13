# Bird Eye v33 API Contract

Source: `docs/reference/architecture-source.md`, section 3. Architecture context: [architecture.md](architecture.md).

All traffic is JSON, except crop images, which upload as multipart files. In the demo the phone uses plain HTTP to the laptop on local Wi-Fi, allowed for that one address by a network security config. Any server off the laptop uses HTTPS.

**There is no authentication in the hackathon build.** The server accepts uploads from the eagle app, and the dashboard has no login. Per-phone keys and dashboard logins are future work. See [architecture.md](architecture.md#9-security-and-privacy).

## Endpoints

| Method and path | Caller | Purpose |
|---|---|---|
| `GET /config` | Phone | Current model version and thresholds |
| `GET /models/{version}` | Phone | Download the TFLite model file |
| `POST /detections/batch` | Phone | Upload a batch of detection records with their crops |
| `POST /tracks` | Phone | Upload a simplified GPS trace with active scanning ranges |
| `POST /heartbeat` | Phone | Device status every 60 seconds |
| `GET /defects` | Dashboard | Defects in a map area, filtered by type, status, urgency |
| `GET /reviews` | Dashboard | Unsure detections to label |
| `POST /reviews/{id}` | Dashboard | The supervisor's answer to one review |
| `POST /defects/{id}/verify` | Dashboard | Supervisor verifies a defect: Detected to Verified |
| `POST /defects/{id}/reject` | Dashboard | Supervisor rejects a false detection: Detected to Rejected |
| `GET /work-orders` | Dashboard | Agent-drafted jobs waiting for approval |
| `POST /work-orders/{id}/approve` | Dashboard | Approve one drafted job: its defects go to Scheduled |
| `PATCH /work-orders/{id}` | Dashboard | Edit a drafted job before approval |
| `POST /work-orders/{id}/reject` | Dashboard | Reject a drafted job |
| `POST /work-orders/{id}/done` | Dashboard | Mark a job done: its defects go to Fixed |
| `GET /brief/latest` | Dashboard | The latest daily brief |
| `GET /devices` | Dashboard | Live device status from heartbeats |
| `GET /coverage` | Dashboard | Scanned versus missed road segments |

The eagle app calls `GET /config` at shift start (the app's Start shift screen) and calls `GET /models/{version}` only when the version has changed. The model bundled in the app is only the offline fallback.

The phone uploads in batches every 5 minutes during the shift over mobile data (starting value, to be tuned). Reason: records are kilobytes and the dashboard is live. There is no end-of-shift WiFi sync.

### Bodies and errors

- Request and response bodies are to be defined for every endpoint except the detection record and heartbeat below. This is deferred in [decisions.md](decisions.md).
- Errors use FastAPI's default format, for example `{"detail": "Not Found"}`. Reason: it needs no extra code, and a custom format is deferred.

## Detection record

Sent by the phone inside `POST /detections/batch`. The crop named in `crop_file` goes in the same request as a multipart file.

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

The values are illustrative.
- `defect_type` is `pothole` or `crack` in this version.
- `band` is `save` or `review`. Dropped detections are never sent.
- `client_id` is generated on the phone, so the server recognises a retried upload and does not store it twice.
- `defect_point` is the vehicle position offset by `distance_ahead_m` along `heading_deg`. The server does not snap it to a road; it stores the nearest segment ID for coverage only.
- `urgent` is always `false` in the 2-class version. It is kept for future classes.

## Heartbeat

Sent by the phone to `POST /heartbeat` every 60 seconds (starting value, to be tuned).

```json
{
  "device_id": "car-03",
  "sent_at": "2026-10-12T08:15:00+08:00",
  "state": "scanning",
  "pause_reason": null,
  "online": true,
  "queue_size": 3,
  "battery_temp_c": 38.5,
  "thermal_status": "light",
  "frame_rate": 3,
  "app_version": "0.4.1",
  "model_version": "m-2026-10-01",
  "model_error": null,
  "position": { "lat": 3.1834, "lon": 101.5139 }
}
```

The values are illustrative. `pause_reason`, `online` and `model_error` are added to the source example.

| `state` | Active? | Meaning |
|---|---|---|
| `scanning` | yes | Full frame rate |
| `cooling` | yes | Reduced frame rate because the phone is hot |
| `paused` | no | Pipeline stopped; `pause_reason` is `heat` or `parked` |

- `pause_reason` is `heat` or `parked` when `state` is `paused`, and `null` otherwise.
- `online` is a boolean, separate from `state`. Reason: a phone can scan while offline and upload later. There is no `offline_queueing` state.
- `model_error` is `null` when the current model loaded. Otherwise it holds the load error, and the phone runs the previous model. Reason: the dashboard can then show which phones are stuck on an old model.

If no heartbeat arrives for several minutes during a shift, the dashboard marks the device as unreachable.

## Track upload

Sent by the phone to `POST /tracks` with each upload batch. Field names are deferred in [decisions.md](decisions.md). It contains:

- a simplified line of GPS points with timestamps, recorded about every second while scanning;
- the time ranges when scanning was active, each with its frame rate.

The backend uses only the active ranges for coverage, so road driven while the phone was paused counts as missed. It estimates frames per segment as active seconds within 10 m of the segment times the range's frame rate. A segment with 6 or more frames on a pass counts as seen (starting value, to be tuned). Reason: the phone sends no per-frame data, so the frame rate in each range is what makes the count possible.
