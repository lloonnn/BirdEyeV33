# Bird Eye v33 API Contract

Matches the code as of 600a4e9.

Architecture context: [architecture.md](architecture.md).

## General rules

- All traffic is JSON, except `POST /detections/batch`, which is multipart.
- Timestamps are ISO 8601 with an offset, for example `2026-10-12T08:14:22+08:00`. The server returns them in its local timezone.
- Coordinates are WGS 84 degrees. JSON objects use `lat` and `lon`. `bbox` on `GET /defects` is longitude first, as GeoJSON requires.
- Crops are served as static files under `/crops`. A `crop_url` is a path such as `/crops/3f6c9e2a.jpg`. The dashboard builds the full URL from the backend address plus `crop_url`.
- All example values are illustrative.
- There is no authentication in the hackathon build.
- The phone uses plain HTTP to the laptop on local Wi-Fi. The dashboard calls the backend directly from the browser, and the backend enables CORS for the dashboard's origin.

### Errors

Errors use FastAPI's format, `{"detail": "<string>"}`.

| Status | When |
|---|---|
| 404 | The ID or resource does not exist |
| 409 | The action is not allowed in the item's current status |
| 422 | The request fails validation |

For 422, `detail` is a list of validation errors instead of a string. Clients must handle both.

## Endpoints

| Method and path | Caller | Returns |
|---|---|---|
| `POST /detections/batch` | Phone | `200` with accepted and duplicate counts |
| `GET /defects` | Dashboard | List of defects |
| `GET /defects/{id}` | Dashboard | One defect with its sightings and history |
| `POST /defects/{id}/verify` | Dashboard | The updated defect: Detected to Verified |
| `POST /defects/{id}/reject` | Dashboard | The updated defect: Detected to Rejected |
| `GET /reviews` | Dashboard | List of reviews |
| `POST /reviews/{id}` | Dashboard | The updated review |
| `GET /work-orders` | Dashboard | List of work orders |
| `GET /work-orders/{id}` | Dashboard | One work order |
| `PATCH /work-orders/{id}` | Dashboard | The updated work order |
| `POST /work-orders/{id}/approve` | Dashboard | The updated work order; its defects go to Scheduled |
| `POST /work-orders/{id}/reject` | Dashboard | The updated work order |
| `POST /work-orders/{id}/done` | Dashboard | The updated work order; its defects go to Fixed |
| `GET /brief/latest` | Dashboard | The latest daily brief, or `404` |

## Phone endpoint

### `POST /detections/batch`

The request is `multipart/form-data` with:
- one part named `records`, holding a JSON array of detection records;
- one JPEG file part per crop, whose part name is the record's `crop_file`.

Response `200`:

```json
{ "accepted": 12, "duplicates": 1 }
```

`duplicates` counts records whose `client_id` was already stored. They are ignored.

The whole batch is rejected with 422 if:
- a record is invalid;
- a crop part is missing or is not a JPEG;
- a crop is over the size limit;
- there are more records than `max_records_per_batch`.

#### Detection record

```json
{
  "client_id": "3f6c9e2a-uuid-made-on-phone",
  "device_id": "car-03",
  "captured_at": "2026-10-12T08:14:22+08:00",
  "defect_type": "pothole",
  "confidence": 0.91,
  "band": "save",
  "bbox": [0.64, 0.82, 0.79, 1.0],
  "vehicle": { "lat": 3.1834, "lon": 101.5139, "gps_accuracy_m": 4.2, "heading_deg": 87, "speed_kmh": 36 },
  "distance_ahead_m": 14.5,
  "defect_point": { "lat": 3.1834, "lon": 101.5142 },
  "model_version": "m-2026-10-01",
  "urgent": false,
  "crop_file": "3f6c9e2a.jpg"
}
```

- `client_id` is made on the phone. It uses only `A-Za-z0-9._-` and is at most 128 characters.
- `captured_at` is rejected if it is too far in the future.
- `defect_type` is `pothole` or `crack`.
- `confidence` is from 0 to 1.
- `band` is `save` or `review`. Dropped detections are never sent.
- `bbox` is `[x1, y1, x2, y2]`, floats from 0 to 1 against the full camera frame, origin top left. `x2` must be greater than `x1`, and `y2` greater than `y1`.
- `vehicle`: `lat` -90 to 90, `lon` -180 to 180, `gps_accuracy_m` at least 0, `heading_deg` 0 to 360, `speed_kmh` at least 0.
- `distance_ahead_m` is at least 0.
- `defect_point` is the vehicle position offset by `distance_ahead_m` along `heading_deg`.
- `urgent` is always `false` in the 2-class version.

#### Phone retry rule

Retry on a network error, 5xx, 429, or a 2xx the app cannot read. Reject the batch on any other 4xx. A readable 2xx removes the batch. Retrying is safe because the server ignores a repeated `client_id`.

## Dashboard endpoints

### Defect object

`GET /defects`, the verify and reject actions, and `GET /defects/{id}` return this object.

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
  "segment_id": null,
  "work_order_id": null,
  "confirmed_at": null,
  "location_reasons": ["school", "junction"]
}
```

- `type` is `pothole` or `crack`.
- `status` is one of `detected`, `verified`, `scheduled`, `fixed`, `confirmed`, `rejected`.
- `urgency` is from 0 to 1. `urgency_terms` holds each term, each from 0 to 1.
- `urgency_band` is `high`, `medium` or `low`.
- `lat` and `lon` are the average of the defect's sightings.
- `crop_url` is the defect's best crop. It can be `null`.
- `segment_id` is always `null`. There are no road segments in the prototype.
- `work_order_id` is set when a work order covering the defect is approved, otherwise `null`.
- `confirmed_at` is when the defect reached `confirmed`, or `null`.
- `location_reasons` is any of `school`, `main_road` and `junction`, or an empty list.

### `GET /defects`

| Parameter | Meaning |
|---|---|
| `bbox` | Required. `minLon,minLat,maxLon,maxLat`. Only defects inside it. |
| `type` | `pothole` or `crack` |
| `status` | One status, or a comma-separated list such as `verified,scheduled` |
| `sort` | `urgency_desc`, the only value |
| `limit` | Maximum number returned. Default 500, capped at 1000. |

- A bad `bbox`, or a minimum that is not below its maximum, gives 422.
- An unknown `status` gives 422.
- A `limit` above the cap is capped, not rejected.

Returns a JSON array of defect objects.

### `GET /defects/{id}`

Returns the defect object plus its sightings and status history, or 404.

```json
{
  "id": 41,
  "...": "the other defect fields",
  "sightings": [
    {
      "id": 902,
      "captured_at": "2026-10-12T08:14:22+08:00",
      "confidence": 0.91,
      "crop_url": "/crops/3f6c9e2a.jpg",
      "device_id": "car-03"
    }
  ],
  "history": [
    { "status": "detected", "at": "2026-10-09T08:02:10+08:00" },
    { "status": "verified", "at": "2026-10-10T08:31:44+08:00" }
  ]
}
```

`history` lists every status the defect has had, oldest first.

### `POST /defects/{id}/verify` and `POST /defects/{id}/reject`

No body. Each returns the updated defect. Verify moves it from `detected` to `verified`. Reject moves it from `detected` to `rejected`, and its crops become negative training examples. Both give 409 if the defect is not `detected`, and 404 for an unknown ID.

### `GET /reviews`

Optional `status`: `pending` or `answered`. Default `pending`. Returns a JSON array:

```json
[
  {
    "id": 77,
    "status": "pending",
    "sighting": {
      "client_id": "8a21d0c4-uuid-made-on-phone",
      "device_id": "car-03",
      "...": "the other detection record fields",
      "crop_url": "/crops/8a21d0c4.jpg"
    }
  }
]
```

`sighting` is the detection record as uploaded, plus `crop_url`.

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

- `class` is `pothole` or `crack`. It is required for `wrong_class` (422 if missing) and ignored for other answers.
- Returns the updated review, now `answered`. Gives 409 if it is already answered, and 404 for an unknown ID.

### Work order object

```json
{
  "id": 15,
  "status": "pending_approval",
  "crew_type": "patching",
  "description": "Patch 2 potholes near a school.",
  "defect_ids": [41, 44],
  "created_at": "2026-10-12T09:00:00+08:00",
  "approved_at": null
}
```

- `status` is one of `pending_approval`, `approved`, `rejected`, `done`.
- `approved_at` is `null` until approval.
- `crew_type` is free text.

### `GET /work-orders` and `GET /work-orders/{id}`

The list takes an optional `status`. An unknown value gives 422. It returns a JSON array of work orders. The single read returns one work order, or 404.

### Work order actions

| Endpoint | Allowed from | Result |
|---|---|---|
| `POST /work-orders/{id}/approve` | `pending_approval` | `approved`; sets `approved_at`; its defects go to `scheduled` and get the work order ID |
| `POST /work-orders/{id}/reject` | `pending_approval` | `rejected`; its defects do not change |
| `POST /work-orders/{id}/done` | `approved` | `done`; its defects go to `fixed` |
| `PATCH /work-orders/{id}` | `pending_approval` | Edits the work order |

- Approve, reject and done take no body.
- Approve gives 409 if any defect is no longer `verified`.
- `PATCH` accepts `description`, `crew_type` and `defect_ids`. A missing field or `null` means no change.
- `defect_ids` may only remove defects. An ID not on the work order gives 422. An empty list gives 409.
- Each action returns the updated work order, 409 from any other status, and 404 for an unknown ID.
- Agents only draft work orders. Every action here is a supervisor's.

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

`defect_ids` lists every defect the brief cites.

## Not built

- `GET /config`
- `GET /models/{version}`
- `POST /heartbeat`
- `POST /tracks`
- `GET /devices`
- `GET /coverage`
