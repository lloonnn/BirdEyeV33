# Bird Eye v33 API Contract

**Version: v0, prototype; may change.** Reason: no endpoint is built yet, and building them will expose mistakes. Change this file and add a row to [decisions.md](decisions.md) when a shape changes.

Source: `docs/reference/architecture-source.md`, section 3, then decisions 62 to 80 in [decisions.md](decisions.md). Architecture context: [architecture.md](architecture.md).

## General rules

- All traffic is JSON, except two cases: `POST /detections/batch` is multipart, and `GET /models/{version}` returns raw bytes.
- Timestamps are ISO 8601 with an offset, for example `2026-10-12T08:14:22+08:00`.
- Coordinates are WGS 84 degrees. JSON objects use `lat` and `lon`; GeoJSON and `bbox` use longitude first, as GeoJSON requires.
- `crop_url` values are URLs the backend serves. The path that serves crops is not fixed in v0, so `/crops/...` in the examples is illustrative.
- All example values are illustrative.

### Transport

In the demo the phone uses plain HTTP to the laptop on local Wi-Fi, allowed for that one address by an Android network security config (decision 60). Any server off the laptop uses HTTPS.

The dashboard reads the backend address from `NEXT_PUBLIC_API_BASE_URL` and calls it directly from the browser. The backend enables CORS for the dashboard's origin. There is no proxy. Reason: one address to configure and no rewrite layer to debug.

**There is no authentication in the hackathon build.** The server accepts uploads from the eagle app, and the dashboard has no login. Per-phone keys and dashboard logins are future work. See [architecture.md](architecture.md#9-security-and-privacy).

### Errors

Errors use FastAPI's default format, `{"detail": ...}`. Reason: it needs no extra code.

| Status | When |
|---|---|
| 404 | The ID or resource does not exist |
| 409 | The action is not allowed in the item's current status |
| 422 | The request fails validation |

For 404 and 409, `detail` is a string. For 422, FastAPI returns `detail` as a list of validation errors, so clients must handle both.

## Endpoints

| Method and path | Caller | Returns |
|---|---|---|
| `GET /config` | Phone | Model version, model hash and thresholds |
| `GET /models/{version}` | Phone | Raw `.tflite` bytes |
| `POST /detections/batch` | Phone | `200` with accepted and duplicate counts |
| `POST /tracks` | Phone | `204` |
| `POST /heartbeat` | Phone | `204` |
| `GET /defects` | Dashboard | List of defects |
| `GET /defects/{id}` | Dashboard | One defect with its sightings |
| `POST /defects/{id}/verify` | Dashboard | The updated defect: Detected to Verified |
| `POST /defects/{id}/reject` | Dashboard | The updated defect: Detected to Rejected |
| `GET /reviews` | Dashboard | List of reviews |
| `POST /reviews/{id}` | Dashboard | The updated review |
| `GET /work-orders` | Dashboard | List of work orders |
| `PATCH /work-orders/{id}` | Dashboard | The updated work order |
| `POST /work-orders/{id}/approve` | Dashboard | The updated work order; its defects go to Scheduled |
| `POST /work-orders/{id}/reject` | Dashboard | The updated work order |
| `POST /work-orders/{id}/done` | Dashboard | The updated work order; its defects go to Fixed |
| `GET /devices` | Dashboard | List of devices with their latest status |
| `GET /coverage` | Dashboard | GeoJSON FeatureCollection of road segments |
| `GET /brief/latest` | Dashboard | The latest daily brief, or `404` |

## Phone endpoints

### `GET /config`

The eagle app calls it at shift start (the app's Start shift screen). Every threshold is a starting value, to be tuned. The values below are the starting parameters in [architecture.md](architecture.md#starting-parameters).

```json
{
  "model_version": "m-2026-10-01",
  "model_sha256": "9b1f...e04a",
  "frame_rate": 3,
  "input_size_px": 640,
  "band_save_min": 0.8,
  "band_review_min": 0.3,
  "crop_long_side_px": 640,
  "gps_interval_s": 1,
  "heartbeat_interval_s": 60,
  "upload_interval_s": 300,
  "duplicate_distance_m": 5,
  "duplicate_time_s": 5
}
```

- A detection with confidence of at least `band_save_min` is a save record, one of at least `band_review_min` is a review record, and anything lower is dropped.
- The field names are v0 placeholders, accepted from the app plan. The app may need more fields as it is built.
- The phone keeps the last good config for offline use. Reason: a shift must start without signal.

### `GET /models/{version}`

Returns the raw `.tflite` file as `application/octet-stream`, or 404 for an unknown version. The phone calls it only when `model_version` in the config differs from the model it has.

The phone checks the download's SHA-256 against `model_sha256` before loading it. On a mismatch or a failed load it keeps the previous model and reports the error in the heartbeat's `model_error`. Reason: a broken download must never replace a working model. The model bundled in the app is only the offline fallback.

### `POST /detections/batch`

The phone uploads in batches every 5 minutes during the shift over mobile data (starting value, to be tuned). Reason: records are kilobytes and the dashboard is live. There is no end-of-shift WiFi sync.

The request is `multipart/form-data` with:
- one part named `records`, holding a JSON array of detection records;
- one file part per crop, whose part name is the record's `crop_file`.

Response `200`:

```json
{ "accepted": 12, "duplicates": 1 }
```

`duplicates` counts records whose `client_id` was already stored. They are ignored, not stored twice. If any record fails validation, the whole batch is rejected with 422.

#### Detection record

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

- `defect_type` is `pothole` or `crack` in this version.
- `band` is `save` or `review`. Dropped detections are never sent.
- `client_id` is generated on the phone, so the server recognises a retried upload and does not store it twice.
- `defect_point` is the vehicle position offset by `distance_ahead_m` along `heading_deg`. The server does not snap it to a road; it stores the nearest segment ID for coverage only.
- `urgent` is always `false` in the 2-class version. It is kept for future classes.

### `POST /tracks`

Sent with each upload batch. Returns `204`.

```json
{
  "device_id": "car-03",
  "points": [
    { "t": "2026-10-12T08:14:21+08:00", "lat": 3.18339, "lon": 101.51385, "accuracy_m": 4.2 },
    { "t": "2026-10-12T08:14:22+08:00", "lat": 3.18340, "lon": 101.51395, "accuracy_m": 4.0 }
  ],
  "active_ranges": [
    { "start": "2026-10-12T08:10:00+08:00", "end": "2026-10-12T08:12:30+08:00", "frame_rate": 3 },
    { "start": "2026-10-12T08:12:30+08:00", "end": "2026-10-12T08:15:00+08:00", "frame_rate": 1 }
  ]
}
```

- `points` is a simplified line of GPS points, recorded about every second while scanning.
- `active_ranges` are the time ranges when the state was `scanning` or `cooling`, each with its frame rate. A change of frame rate starts a new range.

The backend uses only the active ranges for coverage, so road driven while the phone was paused counts as missed. It estimates frames per segment as active seconds within 10 m of the segment times the range's frame rate. A segment with 6 or more frames on a pass counts as seen (starting value, to be tuned). Reason: the phone sends no per-frame data, so the frame rate in each range is what makes the count possible.

### `POST /heartbeat`

Sent every 60 seconds (starting value, to be tuned). Returns `204`.

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

| `state` | Active? | Meaning |
|---|---|---|
| `scanning` | yes | Full frame rate |
| `cooling` | yes | Reduced frame rate because the phone is hot |
| `paused` | no | Pipeline stopped; `pause_reason` is `heat` or `parked` |

- `pause_reason` is `heat` or `parked` when `state` is `paused`, and `null` otherwise.
- `online` is a boolean, separate from `state`. Reason: a phone can scan while offline and upload later. There is no `offline_queueing` state.
- `model_error` is `null` when the current model loaded. Otherwise it holds the load error, and the phone runs the previous model. Reason: the dashboard can then show which phones are stuck on an old model.

### Retry rule for phone uploads

| Result | What the phone does |
|---|---|
| Network error, 5xx or 429 | Keeps the batch and retries it later |
| Any other 4xx | Marks the batch rejected and stops retrying it |
| 2xx | Removes the batch from the local queue |

Reason: network errors, server errors and rate limits are temporary, but a 4xx other than 429 means the request itself is wrong, so resending it cannot succeed. Retrying is safe because the server deduplicates by `client_id`.

## Dashboard endpoints

### Defect object

`GET /defects`, the verify and reject actions, and `GET /defects/{id}` all return this object.

```json
{
  "id": 41,
  "type": "pothole",
  "status": "detected",
  "urgency": 0.72,
  "urgency_band": "high",
  "urgency_terms": { "type": 1.0, "size": 0.4, "location": 0.8, "age": 0.65 },
  "lat": 3.18342,
  "lon": 101.51418,
  "first_seen": "2026-10-09T08:02:10+08:00",
  "last_seen": "2026-10-12T08:14:22+08:00",
  "sighting_count": 5,
  "crop_url": "/crops/3f6c9e2a.jpg",
  "segment_id": 1187,
  "work_order_id": null
}
```

- `type` is `pothole` or `crack`.
- `status` is one of `detected`, `verified`, `scheduled`, `fixed`, `confirmed`, `rejected`.
- `urgency` is from 0 to 1. `urgency_terms` holds each term of the urgency score, each from 0 to 1, so the dashboard can show why a defect ranks where it does.
- `urgency_band` is `high`, `medium` or `low`. The backend sets it from `urgency` with cut-offs in its config. The cut-offs are not chosen yet (decision 65).
- `lat` and `lon` are the average of the defect's sightings.
- `crop_url` points to the defect's best crop.
- `segment_id` is the nearest road segment, used for coverage only.
- `work_order_id` is the work order that covers the defect, or `null` when none does. Reason: otherwise the dashboard must search every work order to find it.

### `GET /defects`

Query parameters, all optional except `bbox`:

| Parameter | Meaning |
|---|---|
| `bbox` | `minLon,minLat,maxLon,maxLat`; only defects inside it |
| `type` | `pothole` or `crack` |
| `status` | One status value |
| `sort` | `urgency_desc`, the only value in v0 |
| `limit` | Maximum number of defects returned |

Returns a JSON array of defect objects.

### `GET /defects/{id}`

Returns the defect object plus its sightings, or 404.

```json
{
  "id": 41,
  "type": "pothole",
  "status": "detected",
  "...": "the other defect fields",
  "sightings": [
    {
      "id": 902,
      "captured_at": "2026-10-12T08:14:22+08:00",
      "confidence": 0.91,
      "crop_url": "/crops/3f6c9e2a.jpg",
      "device_id": "car-03"
    }
  ]
}
```

### `POST /defects/{id}/verify` and `POST /defects/{id}/reject`

No body. Each returns the updated defect object. Verify moves it from `detected` to `verified`. Reject moves it from `detected` to `rejected`, and its crop becomes a negative training example. Both return 409 if the defect is not in `detected`, and 404 for an unknown ID.

### `GET /reviews`

Returns a JSON array:

```json
[
  {
    "id": 77,
    "status": "pending",
    "sighting": {
      "client_id": "8a21d0c4-uuid-made-on-phone",
      "device_id": "car-03",
      "captured_at": "2026-10-12T08:20:05+08:00",
      "defect_type": "crack",
      "confidence": 0.54,
      "band": "review",
      "...": "the other detection record fields",
      "crop_url": "/crops/8a21d0c4.jpg"
    }
  }
]
```

- `status` is `pending` or `answered`.
- `sighting` is the detection record as uploaded, plus `crop_url`.

### `POST /reviews/{id}`

Body:

```json
{ "answer": "wrong_class", "class": "pothole" }
```

| `answer` | What the backend does |
|---|---|
| `correct` | Merges the sighting as if it were a save-band record |
| `wrong_class` | Merges the sighting with the class from `class` |
| `not_defect` | Stores the crop as a negative training example; no defect is created or changed |

- `class` is `pothole` or `crack`. It is required when `answer` is `wrong_class`, otherwise the request fails with 422.
- Returns the updated review, now `answered`. Returns 409 if the review is already answered, and 404 for an unknown ID.

### Work order object

```json
{
  "id": 15,
  "status": "pending_approval",
  "crew_type": "patching",
  "description": "Patch 2 potholes on Jalan Example near the school gate.",
  "defect_ids": [41, 44],
  "created_at": "2026-10-12T09:00:00+08:00",
  "approved_at": null
}
```

- `status` is one of `pending_approval`, `approved`, `rejected`, `done`.
- `approved_at` is `null` until the work order is approved.
- `crew_type` is free text in v0.

### `GET /work-orders`

Optional query parameter `status`, one status value. Returns a JSON array of work order objects.

### Work order actions

| Endpoint | Allowed from | Result |
|---|---|---|
| `POST /work-orders/{id}/approve` | `pending_approval` | `approved`; sets `approved_at`; its defects go to `scheduled` |
| `POST /work-orders/{id}/reject` | `pending_approval` | `rejected`; its defects do not change |
| `POST /work-orders/{id}/done` | `approved` | `done`; its defects go to `fixed` |
| `PATCH /work-orders/{id}` | `pending_approval` | Edits the work order |

- Approve, reject and done take no body.
- `PATCH` accepts any of `description`, `crew_type` and `defect_ids`. Fields left out do not change.
- Each returns the updated work order object, 409 from any other status, and 404 for an unknown ID.
- Agents only draft work orders. Every action here is a supervisor's.

### `GET /devices`

Returns a JSON array, one entry per device, built from the `devices` table and the device's latest heartbeat:

```json
[
  {
    "device_id": "car-03",
    "vehicle": "Patrol car 3",
    "last_heartbeat_at": "2026-10-12T08:15:00+08:00",
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
    "unreachable": false
  }
]
```

`thermal_status`, `frame_rate`, `app_version`, `model_version` and `model_error` are copied from the latest heartbeat. Reason: the heartbeat already sends them, and the Devices page needs them to show phones stuck on an old model.

The backend sets `unreachable` to `true` after 5 minutes without a heartbeat (starting value, to be tuned). Reason: the backend decides it once, so every dashboard screen agrees.

### `GET /coverage`

Query parameters: `bbox` (`minLon,minLat,maxLon,maxLat`) and `since` (a timestamp). Returns a GeoJSON FeatureCollection of the road segments inside `bbox`:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[101.5139, 3.1834], [101.5143, 3.1835]] },
      "properties": {
        "segment_id": 1187,
        "road_class": "secondary",
        "last_scanned_at": "2026-10-12T08:14:30+08:00",
        "target": "daily",
        "overdue": false
      }
    }
  ]
}
```

- `road_class` is the segment's OSM `highway` value.
- `last_scanned_at` is the last pass on which the segment was seen, or `null` if never.
- `target` is `daily` for main roads and school routes, `weekly` for other streets (starting values, to be tuned).
- `overdue` is `true` when the segment was not seen within its target interval.

### `GET /brief/latest`

Returns the latest daily brief, or 404 when none exists.

```json
{
  "id": 9,
  "created_at": "2026-10-12T07:00:04+08:00",
  "text": "Three new potholes since yesterday...",
  "defect_ids": [41, 44, 52]
}
```

`defect_ids` lists every defect the brief cites, so a reviewer can check each claim.
