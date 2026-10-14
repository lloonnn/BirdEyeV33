package com.birdeye

import android.content.Context
import org.json.JSONObject

/*
 * Fixed config files bundled in assets (plan rule 7). Every value is a starting value, to be tuned.
 * config_v0.json has exactly the GET /config shape from docs/api-contract.md v0, so it can later be
 * replaced by the backend's response. app_settings.json holds app-only values the contract does not have.
 */

/** The `GET /config` response, api-contract.md v0. */
data class ConfigV0(
    val modelVersion: String,
    val modelSha256: String,
    val frameRate: Double,
    val inputSizePx: Int,
    val bandSaveMin: Double,
    val bandReviewMin: Double,
    val cropLongSidePx: Int,
    val gpsIntervalS: Double,
    val heartbeatIntervalS: Double,
    val uploadIntervalS: Double,
    val duplicateDistanceM: Double,
    val duplicateTimeS: Double,
)

/** App-only starting values; not contract fields. */
data class AppSettings(
    val cameraHeightM: Double,
    val mountTiltMinDeg: Double,
    val mountTiltMaxDeg: Double,
    val gpsFixMaxAgeS: Double,
    val stillSpeedMaxMps: Double,
    val endShiftStillS: Double,
    val distanceMaxAccuracyM: Double,
)

object Settings {
    private fun read(context: Context, file: String): JSONObject =
        JSONObject(context.assets.open(file).bufferedReader().use { it.readText() })

    fun config(context: Context): ConfigV0 = read(context, "config_v0.json").run {
        ConfigV0(
            modelVersion = getString("model_version"),
            modelSha256 = getString("model_sha256"),
            frameRate = getDouble("frame_rate"),
            inputSizePx = getInt("input_size_px"),
            bandSaveMin = getDouble("band_save_min"),
            bandReviewMin = getDouble("band_review_min"),
            cropLongSidePx = getInt("crop_long_side_px"),
            gpsIntervalS = getDouble("gps_interval_s"),
            heartbeatIntervalS = getDouble("heartbeat_interval_s"),
            uploadIntervalS = getDouble("upload_interval_s"),
            duplicateDistanceM = getDouble("duplicate_distance_m"),
            duplicateTimeS = getDouble("duplicate_time_s"),
        )
    }

    fun app(context: Context): AppSettings = read(context, "app_settings.json").run {
        AppSettings(
            cameraHeightM = getDouble("camera_height_m"),
            mountTiltMinDeg = getDouble("mount_tilt_min_deg"),
            mountTiltMaxDeg = getDouble("mount_tilt_max_deg"),
            gpsFixMaxAgeS = getDouble("gps_fix_max_age_s"),
            stillSpeedMaxMps = getDouble("still_speed_max_mps"),
            endShiftStillS = getDouble("end_shift_still_s"),
            distanceMaxAccuracyM = getDouble("distance_max_accuracy_m"),
        )
    }
}
