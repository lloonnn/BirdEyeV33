package com.birdeye

import android.content.Context
import android.graphics.Bitmap
import android.location.Location
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Debug readout for the Scanning screen. [backend] is "GPU", "CPU", or null before the model loads. */
data class PipelineStats(val backend: String? = null, val inferenceMs: Double = 0.0, val fps: Double = 0.0, val error: String? = null,
    /** Debug: top raw score of the last frame, and why the top detection was or was not saved. */
    val top: Pair<DefectType, Float>? = null, val reason: String? = null,
    /** Detections of the last frame, boxes normalised against a frame of frameW x frameH, for the debug overlay. */
    val boxes: List<Detection> = emptyList(), val frameW: Int = 0, val frameH: Int = 0,
)

/**
 * Frames from a [FrameSource] to queued records: sample, detect, crop, locate, queue. Video is never stored: a frame
 * lives only inside [process] and is dropped at the end. Detection runs on one inference thread;
 * both bands go to the queue through the duplicate filter, which treats each band separately.
 */
class DetectionPipeline(
    context: Context,
    private val config: ConfigV0,
    private val settings: AppSettings,
    private val queue: DetectionQueue,
    private val deviceId: String,
    private val source: FrameSource,
    private val lastFix: () -> Location?,
) {
    private val appContext = context.applicationContext
    private val inference = java.util.concurrent.Executors.newSingleThreadExecutor { Thread(it, "birdeye-inference") }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _stats = MutableStateFlow(PipelineStats())
    val stats: StateFlow<PipelineStats> = _stats

    private var detector: Detector? = null
    private var loadFailed = false
    private var avgInferenceMs = 0.0
    private val doneAtMs = ArrayDeque<Long>()

    /**
     * Starts pulling frames from the source. Every frame is processed on the one inference thread, so the
     * detector (and its GPU delegate, which must stay on the thread that made it) is only used there. The
     * source's thread waits for the result, because it recycles the frame when the call returns.
     */
    fun start() = source.start { frame ->
        try {
            inference.submit { process(frame) }.get()
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt() // stop() was called; let the source's loop see it
        } catch (e: java.util.concurrent.ExecutionException) {
            Log.e("BirdEye", "Frame failed", e.cause ?: e)
        }
    }

    fun stop() = source.stop()

    private fun process(frame: Bitmap) {
        val det = detector ?: run {
            if (loadFailed) return
            try {
                LiteRtDetector(appContext, MODEL_ASSET, config.inputSizePx, config.bandReviewMin, config.nmsIou).also { detector = it }
            } catch (e: Throwable) {
                loadFailed = true
                Log.e("BirdEye", "Model load failed", e)
                _stats.value = PipelineStats(error = "model: ${e.message}")
                return
            }
        }
        val fix = lastFix()
        val capturedAt = OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS)
        val capturedAtMs = System.currentTimeMillis()

        val startNs = SystemClock.elapsedRealtimeNanos()
        val found = det.detect(frame)
        val ms = (SystemClock.elapsedRealtimeNanos() - startNs) / 1e6
        avgInferenceMs = if (avgInferenceMs == 0.0) ms else avgInferenceMs * 0.8 + ms * 0.2
        val now = SystemClock.elapsedRealtime()
        doneAtMs.addLast(now)
        while (doneAtMs.first() < now - 3000) doneAtMs.removeFirst()
        val fps = if (doneAtMs.size > 1) (doneAtMs.size - 1) * 1000.0 / (now - doneAtMs.first()) else 0.0
        _stats.value = PipelineStats(det.backend, avgInferenceMs, fps, top = det.lastTop, boxes = found, frameW = frame.width, frameH = frame.height,
            reason = if (found.isEmpty()) "below review band" else null)

        for ((index, d) in found.withIndex()) {
            // Only the best detection of the frame sets the debug reason.
            fun why(reason: String) { if (index == 0) _stats.value = _stats.value.copy(reason = reason) }
            val band = bandFor(d.score, config.bandSaveMin)
            if (fix == null || !fixFresh(fix)) {
                Log.d("BirdEye", "Detection dropped: no fresh GPS fix")
                why("no GPS fix")
                continue
            }
            if (!fix.hasBearing()) {
                Log.d("BirdEye", "Detection dropped: no heading")
                why("no heading")
                continue
            }
            val located = locate(d, fix, frame.width, frame.height)
            if (located == null) { why("above horizon"); continue }
            val jpeg = cropJpeg(frame, d.bbox)
            val clientId = UUID.randomUUID().toString()
            val record = DetectionRecord(
                clientId = clientId,
                deviceId = deviceId,
                capturedAt = capturedAt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                defectType = d.type,
                confidence = d.score.toDouble(),
                band = band,
                bbox = d.bbox.toList(),
                vehicle = Vehicle(
                    lat = fix.latitude,
                    lon = fix.longitude,
                    gpsAccuracyM = fix.accuracy.toDouble(),
                    headingDeg = fix.bearing.toDouble(),
                    speedKmh = if (fix.hasSpeed()) fix.speed * 3.6 else 0.0,
                ),
                distanceAheadM = located.first,
                defectPoint = located.second,
                modelVersion = config.modelVersion,
                urgent = false,
                cropFile = "$clientId.jpg",
            )
            scope.launch {
                val decision = queue.add(record, capturedAtMs, jpeg)
                Log.i("BirdEye", "Detection${if (BuildConfig.REPLAY) " [REPLAY, test footage]" else ""} ${record.defectType.wire} %.2f ${record.clientId.take(8)}: $decision".format(record.confidence))
                why(if (decision == DupDecision.Drop) "duplicate" else if (band == Band.Review) "saved (review band)" else "saved")
            }
        }
    }

    /** The fix must be newer than gps_fix_max_age_s, and carry a heading (checked by the caller), or the defect point would be a guess. */
    private fun fixFresh(fix: Location): Boolean {
        val ageMs = (SystemClock.elapsedRealtimeNanos() - fix.elapsedRealtimeNanos) / 1_000_000
        return ageMs <= settings.gpsFixMaxAgeS * 1000
    }

    /** Distance ahead and defect point, or null when the box's bottom edge is not on the road ahead. */
    private fun locate(d: Detection, fix: Location, frameW: Int, frameH: Int): Pair<Double, LatLon>? {
        val mount = appContext.getSharedPreferences("mount", Context.MODE_PRIVATE)
        val height = mount.getFloat("camera_height_m", BuildConfig.CAMERA_HEIGHT_M.toFloat()).toDouble()
        val tilt = mount.getFloat("tilt_down_deg", 0f).toDouble()
        val fov = fov ?: backCameraFov(appContext)?.also { fov = it }
        if (fov == null) {
            Log.w("BirdEye", "Detection dropped: no camera field of view")
            return null
        }
        // The upright frame is taller than wide in portrait, so its vertical axis is the sensor's long side.
        val frameIsPortrait = frameH >= frameW
        val vFov = (if (frameIsPortrait) fov.longSideDeg else fov.shortSideDeg).toDouble()
        val dist = distanceAheadM(height, tilt, vFov, d.bbox[3].toDouble()) ?: run {
            Log.d("BirdEye", "Detection dropped: box bottom is above the horizon")
            return null
        }
        return dist to offsetPoint(fix.latitude, fix.longitude, fix.bearing.toDouble(), dist)
    }

    private var fov: CameraFov? = null

    /** Box plus margin, cut from the full frame, long side at most crop_long_side_px, as JPEG. */
    private fun cropJpeg(frame: Bitmap, bbox: FloatArray): ByteArray {
        val w = frame.width
        val h = frame.height
        val mx = (bbox[2] - bbox[0]) * w * settings.cropMarginFrac.toFloat()
        val my = (bbox[3] - bbox[1]) * h * settings.cropMarginFrac.toFloat()
        val x1 = max(0, (bbox[0] * w - mx).roundToInt())
        val y1 = max(0, (bbox[1] * h - my).roundToInt())
        val x2 = min(w, (bbox[2] * w + mx).roundToInt())
        val y2 = min(h, (bbox[3] * h + my).roundToInt())
        val cropW = max(1, x2 - x1)
        val cropH = max(1, y2 - y1)
        val crop = Bitmap.createBitmap(frame, x1, y1, cropW, cropH)
        val scale = min(1f, config.cropLongSidePx.toFloat() / max(cropW, cropH))
        val out = if (scale < 1f) Bitmap.createScaledBitmap(crop, max(1, (cropW * scale).roundToInt()), max(1, (cropH * scale).roundToInt()), true) else crop
        return ByteArrayOutputStream().use {
            out.compress(Bitmap.CompressFormat.JPEG, settings.jpegQuality, it)
            // createBitmap can hand back the frame itself when the box covers all of it; never recycle that.
            if (out !== crop) out.recycle()
            if (crop !== frame) crop.recycle()
            it.toByteArray()
        }
    }

    fun close() {
        source.stop()
        inference.execute {
            detector?.close()
            detector = null
        }
        inference.shutdown()
    }

    companion object {
        const val MODEL_ASSET = "birdeye_m-2026-10-19-full_full_float16.tflite"
    }
}
