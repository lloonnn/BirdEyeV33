package com.birdeye

import android.location.Location
import android.location.LocationManager
import android.os.SystemClock
import android.util.Log
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.math.cos

/** One point of a replay track (replay_track.json): all fields as in the file. */
data class TrackSample(
    val tMs: Long,
    val lat: Double,
    val lon: Double,
    val headingDeg: Double,
    val speedKmh: Double,
    val accuracyM: Double,
)

/** A replay track: samples sorted by time. [at] interpolates by video time and holds the ends. */
class ReplayTrack(samples: List<TrackSample>) {
    private val samples = samples.sortedBy { it.tMs }

    init {
        require(this.samples.isNotEmpty()) { "A replay track needs at least one point" }
    }

    fun at(tMs: Long): TrackSample {
        val first = samples.first()
        val last = samples.last()
        if (tMs <= first.tMs) return first.copy(tMs = tMs)
        if (tMs >= last.tMs) return last.copy(tMs = tMs)
        val i = samples.indexOfLast { it.tMs <= tMs }
        val a = samples[i]
        val b = samples[i + 1]
        val f = (tMs - a.tMs).toDouble() / (b.tMs - a.tMs)
        fun mix(x: Double, y: Double) = x + (y - x) * f
        // Heading takes the short way round, so 350 to 10 passes 0 and not 180.
        val turn = ((b.headingDeg - a.headingDeg + 540) % 360) - 180
        return TrackSample(
            tMs, mix(a.lat, b.lat), mix(a.lon, b.lon), (a.headingDeg + turn * f + 360) % 360,
            mix(a.speedKmh, b.speedKmh), mix(a.accuracyM, b.accuracyM),
        )
    }

    companion object {
        /** Reads a list of `{t_ms, lat, lon, heading_deg, speed_kmh, accuracy_m}`. */
        fun parse(text: String): ReplayTrack = ReplayTrack(
            Json.parseToJsonElement(text).jsonArray.map {
                val o = it.jsonObject
                fun d(key: String) = o.getValue(key).jsonPrimitive.doubleOrNull ?: error("$key is not a number")
                TrackSample(d("t_ms").toLong(), d("lat"), d("lon"), d("heading_deg"), d("speed_kmh"), d("accuracy_m"))
            },
        )

        /** A straight line at constant speed and heading from the start point; [lengthMs] long. */
        fun line(lat: Double, lon: Double, headingDeg: Double, speedKmh: Double, accuracyM: Double, lengthMs: Long): ReplayTrack {
            val metres = speedKmh / 3.6 * lengthMs / 1000.0
            val theta = Math.toRadians(headingDeg)
            val end = TrackSample(
                lengthMs,
                lat + metres * cos(theta) / 111_320.0,
                lon + metres * kotlin.math.sin(theta) / (111_320.0 * cos(Math.toRadians(lat))),
                headingDeg, speedKmh, accuracyM,
            )
            return ReplayTrack(listOf(TrackSample(0, lat, lon, headingDeg, speedKmh, accuracyM), end))
        }
    }
}

/**
 * Replay: a fake GPS track instead of the GPS chip. Every gps_interval_s it emits a fix for the
 * current video time ([videoTimeMs]). Fixes carry the current clock, so they look fresh to the pipeline.
 * The track comes from replay_track.json; if the file is missing, it is a straight line from the
 * INVENTED start values in app_settings.json.
 */
class ReplayLocationSource(
    private val track: ReplayTrack,
    private val intervalMs: Long,
    private val videoTimeMs: () -> Long,
) : LocationSource {
    private val executor = Executors.newSingleThreadScheduledExecutor { Thread(it, "birdeye-replay-gps") }
    private var task: ScheduledFuture<*>? = null

    fun sampleAt(tMs: Long): TrackSample = track.at(tMs)

    override fun start(onFix: (Location) -> Unit): Boolean {
        task?.cancel(false)
        task = executor.scheduleAtFixedRate({
            val s = track.at(videoTimeMs())
            onFix(
                Location(LocationManager.GPS_PROVIDER).apply {
                    latitude = s.lat
                    longitude = s.lon
                    accuracy = s.accuracyM.toFloat()
                    bearing = s.headingDeg.toFloat()
                    speed = (s.speedKmh / 3.6).toFloat()
                    time = System.currentTimeMillis()
                    elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                },
            )
        }, 0, intervalMs, TimeUnit.MILLISECONDS)
        return true
    }

    override fun stop() {
        task?.cancel(false)
        task = null
    }

    companion object {
        fun create(context: android.content.Context, config: ConfigV0, settings: AppSettings, videoTimeMs: () -> Long): ReplayLocationSource {
            val file = File(replayDir(context), "replay_track.json")
            val track = try {
                if (file.exists()) ReplayTrack.parse(file.readText()) else null
            } catch (e: Exception) {
                Log.e("BirdEye", "Replay: replay_track.json is not valid", e)
                null
            } ?: run {
                Log.w("BirdEye", "Replay: using the invented straight line from app_settings.json")
                ReplayTrack.line(
                    settings.replayStartLat, settings.replayStartLon, settings.replayHeadingDeg,
                    settings.replaySpeedKmh, settings.replayAccuracyM, lengthMs = 24 * 60 * 60 * 1000L,
                )
            }
            return ReplayLocationSource(track, (config.gpsIntervalS * 1000).toLong(), videoTimeMs)
        }
    }
}
