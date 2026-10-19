package com.birdeye

import android.Manifest
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper

/** Where GPS fixes come from: the phone, or a replayed track. */
interface LocationSource {
    /** Starts delivering fixes. Returns false if it could not start (for example, no permission). */
    fun start(onFix: (Location) -> Unit): Boolean

    fun stop()
}

/** The phone's GPS chip through Android's own LocationManager (plan rule 8), delivered on the main thread. */
class LocationManagerSource(private val context: Context, private val intervalMs: Long) : LocationSource {
    private val manager = context.getSystemService(LocationManager::class.java)
    private var listener: LocationListener? = null

    override fun start(onFix: (Location) -> Unit): Boolean {
        if (listener != null) return true
        if (!hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)) return false
        // All four methods are implemented: on API 26 to 29 they are abstract, and a missing one crashes.
        val l = object : LocationListener {
            override fun onLocationChanged(location: Location) = onFix(location)
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
            @Deprecated("Required on API 26 to 28")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }
        return try {
            manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, intervalMs, 0f, l, Looper.getMainLooper())
            listener = l
            true
        } catch (e: SecurityException) {
            false
        }
    }

    override fun stop() {
        listener?.let { manager.removeUpdates(it) }
        listener = null
    }
}
