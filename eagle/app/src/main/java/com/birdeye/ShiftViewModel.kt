package com.birdeye

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

enum class Screen { StartShift, Scanning, EndOfShift }

/** Result of the Start shift GPS check, with the reason when it fails. */
sealed interface GpsCheck {
    /** A fresh GPS_PROVIDER fix within gps_fix_max_accuracy_m. */
    data class Ok(val accuracyM: Float) : GpsCheck
    /** Location is switched off on the phone. */
    data object LocationOff : GpsCheck
    /** No fresh fix from the GPS chip. Typical indoors, where only WiFi or cell location works. */
    data object NoFix : GpsCheck
    /** A fresh fix, but less accurate than gps_fix_max_accuracy_m. */
    data class TooInaccurate(val accuracyM: Float) : GpsCheck
}

/** Why End shift is allowed. Null means it is not: the vehicle may be moving. */
enum class EndShiftReason { Still, NoGps }

/**
 * Shift state and GPS, kept in a ViewModel so a rotation does not lose the shift or its distance.
 * Location uses Android's own LocationManager (plan rule 8), not Play services.
 */
class ShiftViewModel(app: Application) : AndroidViewModel(app) {
    val config = Settings.config(app)
    val settings = Settings.app(app)
    val queue = DetectionQueue(app)
    val pipeline = DetectionPipeline(app, config, settings, queue, Api.deviceId) { lastFix }

    /** Wall-clock start of the current shift, for the End of shift counts. */
    var shiftStartWallMs by mutableLongStateOf(System.currentTimeMillis())
        private set

    /** Debug: the mock fails every call, to test retries. Kept in preferences so the worker sees it. */
    var mockFails by mutableStateOf(Api.mockFails(app))
        private set

    fun toggleMockFails() {
        mockFails = !mockFails
        Api.setMockFails(getApplication(), mockFails)
    }

    /** Debug builds only: queue an invented record near the current position. Needs a GPS fix. */
    fun addFakeDetection() {
        val fix = lastFix ?: return
        val (record, jpeg) = FakeDetection.make(fix, Api.deviceId)
        viewModelScope.launch {
            val decision = queue.add(record, System.currentTimeMillis(), jpeg)
            Log.i("BirdEye", "Fake detection ${record.clientId.take(8)}: $decision")
        }
    }

    var screen by mutableStateOf(Screen.StartShift)
        private set

    /** Debug-only: shows the Cooling down variant of the Scanning screen. Nothing else sets it yet. */
    var cooling by mutableStateOf(false)

    /** Bumped on every onResume, so permission checks re-run after the user returns from Settings. */
    var resumeTick by mutableIntStateOf(0)

    var lastFix by mutableStateOf<Location?>(null)
        private set

    /** Elapsed-realtime ms since the vehicle has been at or below the still speed; null while moving. */
    var stillSinceMs by mutableStateOf<Long?>(null)
        private set

    var distanceM by mutableDoubleStateOf(0.0)
        private set

    private var shiftStartMs = 0L
    private var lastDistanceFix: Location? = null
    private var listening = false
    private val locationManager = app.getSystemService(LocationManager::class.java)

    // All four methods are implemented: on API 26 to 29 they are abstract, and a missing one crashes.
    private val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) = onFix(location)
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
        @Deprecated("Required on API 26 to 28")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

    fun startLocation() {
        val context: Context = getApplication()
        if (listening || !hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)) return
        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                (config.gpsIntervalS * 1000).toLong(),
                0f,
                listener,
                Looper.getMainLooper(),
            )
            listening = true
        } catch (e: SecurityException) {
            listening = false
        }
    }

    private fun onFix(location: Location) {
        val fixMs = location.elapsedRealtimeNanos / 1_000_000
        val still = location.hasSpeed() && location.speed <= settings.stillSpeedMaxMps
        stillSinceMs = if (still) stillSinceMs ?: fixMs else null

        // Distance counts only while scanning, only when moving, and only for usable fixes,
        // so GPS jitter at a standstill does not add up.
        if (screen == Screen.Scanning && !still && location.accuracy <= settings.distanceMaxAccuracyM) {
            lastDistanceFix?.let { distanceM += it.distanceTo(location) }
            lastDistanceFix = location
        }
        lastFix = location
        // The screen shows only ready or searching; the real accuracy is here for testing (adb logcat -s BirdEye).
        Log.d("BirdEye", "GPS fix from ${location.provider}: accuracy ${location.accuracy} m, limit ${settings.gpsFixMaxAccuracyM} m")
    }

    /**
     * Start shift GPS check. Passes only on a fix from LocationManager.GPS_PROVIDER, newer than
     * gps_fix_max_age_s and with accuracy at or under gps_fix_max_accuracy_m. Reason: WiFi and cell
     * positions are tens of metres off, too coarse to place a defect.
     */
    fun gpsCheck(nowMs: Long): GpsCheck {
        if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) return GpsCheck.LocationOff
        val fix = lastFix
        if (fix == null || fix.provider != LocationManager.GPS_PROVIDER || !hasFix(nowMs) || !fix.hasAccuracy()) {
            return GpsCheck.NoFix
        }
        return if (fix.accuracy <= settings.gpsFixMaxAccuracyM) GpsCheck.Ok(fix.accuracy) else GpsCheck.TooInaccurate(fix.accuracy)
    }

    fun hasFix(nowMs: Long): Boolean {
        val fix = lastFix ?: return false
        return nowMs - fix.elapsedRealtimeNanos / 1_000_000 <= settings.gpsFixMaxAgeS * 1000
    }

    /**
     * End shift is allowed when the phone has been still for end_shift_still_s, or when there has been
     * no GPS fix for end_shift_no_fix_s (since the last fix, or since shift start if none came during
     * the shift). Reason for the second: without GPS the app cannot tell moving from still, and the
     * driver must still be able to end the shift, for example in a covered car park.
     */
    fun endShiftReason(nowMs: Long): EndShiftReason? {
        val since = stillSinceMs
        if (since != null && hasFix(nowMs) && nowMs - since >= settings.endShiftStillS * 1000) {
            return EndShiftReason.Still
        }
        val lastFixMs = lastFix?.let { it.elapsedRealtimeNanos / 1_000_000 } ?: 0L
        val noFixSinceMs = maxOf(lastFixMs, shiftStartMs)
        return if (nowMs - noFixSinceMs >= settings.endShiftNoFixS * 1000) EndShiftReason.NoGps else null
    }

    fun startShift(tiltDownDeg: Float) {
        // Read by the pipeline for the distance-ahead formula. Height comes from local.properties per phone.
        getApplication<Application>().getSharedPreferences("mount", Context.MODE_PRIVATE).edit {
            putFloat("camera_height_m", BuildConfig.CAMERA_HEIGHT_M.toFloat())
            putFloat("tilt_down_deg", tiltDownDeg)
        }
        distanceM = 0.0
        lastDistanceFix = null
        shiftStartMs = SystemClock.elapsedRealtime()
        shiftStartWallMs = System.currentTimeMillis()
        // Keep detection_log small: drop expired entries unless their detections are still pending.
        viewModelScope.launch {
            val removed = queue.pruneLog(logPruneCutoffMs(shiftStartWallMs, settings.logKeepDays))
            Log.i("BirdEye", "Pruned $removed old detection_log entries")
        }
        cooling = false
        screen = Screen.Scanning
    }

    fun endShift() {
        screen = Screen.EndOfShift
    }

    fun newShift() {
        screen = Screen.StartShift
    }

    override fun onCleared() {
        locationManager.removeUpdates(listener)
        pipeline.close()
    }
}

fun hasPermission(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
