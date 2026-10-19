package com.birdeye

import java.io.File

/*
 * Request and response shapes from docs/api-contract.md v0. Kotlin names are camelCase; the wire
 * name of every field is in its comment, and the JSON written in phase 3 uses those names exactly.
 * ConfigV0 (GET /config) is in Settings.kt, because the bundled config_v0.json has the same shape.
 */

/** `defect_type`: pothole or crack in the 2-class version. */
enum class DefectType(val wire: String) { Pothole("pothole"), Crack("crack") }

/** `band`: save or review. Dropped detections are never sent. */
enum class Band(val wire: String) { Save("save"), Review("review") }

/** A position object: `{ "lat", "lon" }`. */
data class LatLon(val lat: Double, val lon: Double)

/** `vehicle`: where the vehicle was when the frame was taken. */
data class Vehicle(
    val lat: Double, // lat
    val lon: Double, // lon
    val gpsAccuracyM: Double, // gps_accuracy_m
    val headingDeg: Double, // heading_deg
    val speedKmh: Double, // speed_kmh
)

/** One detection record inside `POST /detections/batch`. */
data class DetectionRecord(
    val clientId: String, // client_id, a UUID made on the phone
    val deviceId: String, // device_id
    val capturedAt: String, // captured_at, ISO 8601 with offset
    val defectType: DefectType, // defect_type
    val confidence: Double, // confidence
    val band: Band, // band
    // bbox: [x1, y1, x2, y2], floats 0 to 1 against the full camera frame, origin top left (15 Oct).
    // Decoder.kt produces this format and undoes the letterbox padding.
    val bbox: List<Float>,
    val vehicle: Vehicle, // vehicle
    val distanceAheadM: Double, // distance_ahead_m
    val defectPoint: LatLon, // defect_point
    val modelVersion: String, // model_version
    val urgent: Boolean, // urgent: always false in the 2-class version
    val cropFile: String, // crop_file, also the multipart part name of the crop
)

/**
 * `POST /detections/batch` body: the `records` part plus one file part per crop, keyed by part name
 * (the record's crop_file). RealBirdEyeApi turns this into multipart/form-data.
 */
data class DetectionBatch(val records: List<DetectionRecord>, val crops: Map<String, File>)

/** `POST /detections/batch` response 200: `{ "accepted", "duplicates" }`. */
data class BatchResult(val accepted: Int, val duplicates: Int)

/** Heartbeat `state`. */
enum class HeartbeatState(val wire: String) { Scanning("scanning"), Cooling("cooling"), Paused("paused") }

/** Heartbeat `pause_reason`, set only when the state is paused. */
enum class PauseReason(val wire: String) { Heat("heat"), Parked("parked") }

/** `POST /heartbeat` body. */
data class Heartbeat(
    val deviceId: String, // device_id
    val sentAt: String, // sent_at
    val state: HeartbeatState, // state
    val pauseReason: PauseReason?, // pause_reason
    val online: Boolean, // online
    val queueSize: Int, // queue_size
    val batteryTempC: Double, // battery_temp_c
    val thermalStatus: String, // thermal_status: the contract shows only "light", so no enum yet
    val frameRate: Double, // frame_rate
    val appVersion: String, // app_version
    val modelVersion: String, // model_version
    val modelError: String?, // model_error
    val position: LatLon?, // position
)

/** One point of `points` in `POST /tracks`. */
data class TrackPoint(val t: String, val lat: Double, val lon: Double, val accuracyM: Double) // accuracy_m

/** One range of `active_ranges` in `POST /tracks`. */
data class ActiveRange(val start: String, val end: String, val frameRate: Double) // frame_rate

/** `POST /tracks` body. */
data class TrackUpload(
    val deviceId: String, // device_id
    val points: List<TrackPoint>, // points
    val activeRanges: List<ActiveRange>, // active_ranges
)

/**
 * A failed call. httpStatus is null for a network error. Retry rule from the contract: network
 * errors, 5xx and 429 are retried; any other 4xx marks the batch rejected.
 */
class ApiError(val httpStatus: Int?, message: String) : Exception(message) {
    val retryable: Boolean get() = httpStatus == null || httpStatus >= 500 || httpStatus == 429
}
