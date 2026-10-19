package com.birdeye

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.location.Location
import android.os.SystemClock
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
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
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Debug readout for the Scanning screen. [backend] is "GPU", "CPU", or null before the model loads. */
data class PipelineStats(val backend: String? = null, val inferenceMs: Double = 0.0, val fps: Double = 0.0, val error: String? = null,
    /** Debug: top raw score of the last frame, and why the top detection was or was not saved. */
    val top: Pair<DefectType, Float>? = null, val reason: String? = null,
)

/**
 * Camera frames to queued records: sample, detect, crop, locate, queue. Video is never stored: a frame
 * lives only inside [analyze] and is dropped at the end. Detection runs on its own single thread; the
 * save band goes to the queue through the duplicate filter, the review band is dropped for now.
 */
class DetectionPipeline(
    context: Context,
    private val config: ConfigV0,
    private val settings: AppSettings,
    private val queue: DetectionQueue,
    private val deviceId: String,
    private val lastFix: () -> Location?,
) {
    private val appContext = context.applicationContext
    val executor = Executors.newSingleThreadExecutor { Thread(it, "birdeye-detect") }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _stats = MutableStateFlow(PipelineStats())
    val stats: StateFlow<PipelineStats> = _stats

    private var detector: Detector? = null
    private var loadFailed = false
    private var lastSampleMs = 0L
    private var avgInferenceMs = 0.0
    private val doneAtMs = ArrayDeque<Long>()

    /** Analysis use case for CameraX, already pointed at this pipeline. */
    fun analysisUseCase(): ImageAnalysis = ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
        .build()
        .also { it.setAnalyzer(executor) { image -> analyze(image) } }

    private fun analyze(image: ImageProxy) {
        try {
            val nowMs = SystemClock.elapsedRealtime()
            // Half a camera frame of slack, so 30 fps input still gives the configured rate.
            if (nowMs - lastSampleMs < 1000.0 / config.frameRate - 16) return
            lastSampleMs = nowMs
            val frame = upright(image)
            try {
                process(frame)
            } finally {
                frame.recycle()
            }
        } catch (e: Throwable) {
            Log.e("BirdEye", "Frame failed", e)
        } finally {
            image.close()
        }
    }

    private fun upright(image: ImageProxy): Bitmap {
        val raw = image.toBitmap()
        val rotation = image.imageInfo.rotationDegrees
        if (rotation == 0) return raw
        val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
        raw.recycle()
        return rotated
    }

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
        _stats.value = PipelineStats(det.backend, avgInferenceMs, fps, top = det.lastTop,
            reason = if (found.isEmpty()) "below review band" else null)

        for ((index, d) in found.withIndex()) {
            // Only the best detection of the frame sets the debug reason.
            fun why(reason: String) { if (index == 0) _stats.value = _stats.value.copy(reason = reason) }
            if (d.score < config.bandSaveMin) { why("review band"); continue } // dropped in this phase
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
                band = Band.Save,
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
                Log.i("BirdEye", "Detection ${record.defectType.wire} %.2f ${record.clientId.take(8)}: $decision".format(record.confidence))
                why(if (decision == DupDecision.Drop) "duplicate" else "saved")
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
            if (out !== crop) out.recycle()
            crop.recycle()
            it.toByteArray()
        }
    }

    fun close() {
        executor.execute { detector?.close(); detector = null }
        executor.shutdown()
    }

    companion object {
        const val MODEL_ASSET = "birdeye_m-2026-10-19_quick_float16.tflite"
    }
}
