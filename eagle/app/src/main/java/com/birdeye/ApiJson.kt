package com.birdeye

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/*
 * JSON for api-contract.md v0. Every key is written out by name, so the wire format cannot drift when
 * a Kotlin field is renamed. ApiJsonTest checks the record keys against the contract example.
 */

private fun str(value: String?): JsonElement = if (value == null) JsonNull else JsonPrimitive(value)

private fun latLon(p: LatLon) = buildJsonObject {
    put("lat", p.lat)
    put("lon", p.lon)
}

fun DetectionRecord.toJson(): JsonObject = buildJsonObject {
    put("client_id", clientId)
    put("device_id", deviceId)
    put("captured_at", capturedAt)
    put("defect_type", defectType.wire)
    put("confidence", confidence)
    put("band", band.wire)
    put("bbox", JsonArray(bbox.map { JsonPrimitive(it) }))
    put(
        "vehicle",
        buildJsonObject {
            put("lat", vehicle.lat)
            put("lon", vehicle.lon)
            put("gps_accuracy_m", vehicle.gpsAccuracyM)
            put("heading_deg", vehicle.headingDeg)
            put("speed_kmh", vehicle.speedKmh)
        },
    )
    put("distance_ahead_m", distanceAheadM)
    put("defect_point", latLon(defectPoint))
    put("model_version", modelVersion)
    put("urgent", urgent)
    put("crop_file", cropFile)
}

fun Heartbeat.toJson(): JsonObject = buildJsonObject {
    put("device_id", deviceId)
    put("sent_at", sentAt)
    put("state", state.wire)
    put("pause_reason", str(pauseReason?.wire))
    put("online", online)
    put("queue_size", queueSize)
    put("battery_temp_c", batteryTempC)
    put("thermal_status", thermalStatus)
    put("frame_rate", frameRate)
    put("app_version", appVersion)
    put("model_version", modelVersion)
    put("model_error", str(modelError))
    put("position", if (position == null) JsonNull else latLon(position))
}

fun TrackUpload.toJson(): JsonObject = buildJsonObject {
    put("device_id", deviceId)
    put(
        "points",
        JsonArray(
            points.map {
                buildJsonObject {
                    put("t", it.t)
                    put("lat", it.lat)
                    put("lon", it.lon)
                    put("accuracy_m", it.accuracyM)
                }
            },
        ),
    )
    put(
        "active_ranges",
        JsonArray(
            activeRanges.map {
                buildJsonObject {
                    put("start", it.start)
                    put("end", it.end)
                    put("frame_rate", it.frameRate)
                }
            },
        ),
    )
}

/** Reads a `GET /config` body. `nms_iou` is not in the contract yet, so it falls back to 0.7. */
fun parseConfig(body: JsonObject): ConfigV0 {
    fun d(key: String) = body.getValue(key).jsonPrimitive.doubleOrNull ?: error("config.$key is not a number")
    return ConfigV0(
        modelVersion = body.getValue("model_version").jsonPrimitive.content,
        modelSha256 = body.getValue("model_sha256").jsonPrimitive.content,
        frameRate = d("frame_rate"),
        inputSizePx = body.getValue("input_size_px").jsonPrimitive.int,
        bandSaveMin = d("band_save_min"),
        bandReviewMin = d("band_review_min"),
        cropLongSidePx = body.getValue("crop_long_side_px").jsonPrimitive.int,
        gpsIntervalS = d("gps_interval_s"),
        heartbeatIntervalS = d("heartbeat_interval_s"),
        uploadIntervalS = d("upload_interval_s"),
        duplicateDistanceM = d("duplicate_distance_m"),
        duplicateTimeS = d("duplicate_time_s"),
        nmsIou = body["nms_iou"]?.jsonPrimitive?.doubleOrNull ?: 0.7,
    )
}

fun parseBatchResult(body: JsonObject) = BatchResult(
    accepted = body.getValue("accepted").jsonPrimitive.int,
    duplicates = body.getValue("duplicates").jsonPrimitive.int,
)
