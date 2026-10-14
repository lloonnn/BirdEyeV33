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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel

enum class Screen { StartShift, Scanning, EndOfShift }

/**
 * Shift state and GPS, kept in a ViewModel so a rotation does not lose the shift or its distance.
 * Location uses Android's own LocationManager (plan rule 8), not Play services.
 */
class ShiftViewModel(app: Application) : AndroidViewModel(app) {
    val config = Settings.config(app)
    val settings = Settings.app(app)

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

    var distanceM by mutableStateOf(0.0)
        private set

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
    }

    fun hasFix(nowMs: Long): Boolean {
        val fix = lastFix ?: return false
        return nowMs - fix.elapsedRealtimeNanos / 1_000_000 <= settings.gpsFixMaxAgeS * 1000
    }

    /** End shift is allowed only with a recent fix and speed at or below the still speed for end_shift_still_s. */
    fun isStill(nowMs: Long): Boolean {
        val since = stillSinceMs ?: return false
        return hasFix(nowMs) && nowMs - since >= settings.endShiftStillS * 1000
    }

    fun startShift(tiltDownDeg: Float) {
        // Stored for the distance-ahead formula in phase 3. Height is a fixed config value for now.
        getApplication<Application>().getSharedPreferences("mount", Context.MODE_PRIVATE).edit {
            putFloat("camera_height_m", settings.cameraHeightM.toFloat())
            putFloat("tilt_down_deg", tiltDownDeg)
        }
        distanceM = 0.0
        lastDistanceFix = null
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
    }
}

fun hasPermission(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
