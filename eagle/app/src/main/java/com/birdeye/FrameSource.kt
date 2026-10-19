package com.birdeye

import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.SystemClock
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.concurrent.Executors

/**
 * Where frames come from. The pipeline depends only on this. A source delivers upright frames at
 * frame_rate, one at a time, on its own thread, and recycles each bitmap after the sink returns,
 * so the sink must not keep it.
 */
interface FrameSource {
    /** Position in the replay video in ms; null for the camera. */
    val videoTimeMs: StateFlow<Long?>

    fun start(sink: (Bitmap) -> Unit)

    fun stop()
}

/**
 * The phone camera, through CameraX ImageAnalysis. CameraX only runs while [CameraPreview] has
 * bound [analysisUseCase] to the screen's lifecycle; [start] says where its frames go.
 */
class CameraFrameSource(private val config: ConfigV0) : FrameSource {
    override val videoTimeMs: StateFlow<Long?> = MutableStateFlow(null)

    private val executor = Executors.newSingleThreadExecutor { Thread(it, "birdeye-detect") }

    @Volatile private var sink: ((Bitmap) -> Unit)? = null
    private var lastSampleMs = 0L

    override fun start(sink: (Bitmap) -> Unit) {
        this.sink = sink
    }

    override fun stop() {
        sink = null
    }

    /** Analysis use case for CameraX, pointed at this source. */
    fun analysisUseCase(): ImageAnalysis = ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
        .build()
        .also { it.setAnalyzer(executor) { image -> analyze(image) } }

    private fun analyze(image: ImageProxy) {
        try {
            val target = sink ?: return
            val nowMs = SystemClock.elapsedRealtime()
            // Half a camera frame of slack, so 30 fps input still gives the configured rate.
            if (nowMs - lastSampleMs < 1000.0 / config.frameRate - 16) return
            lastSampleMs = nowMs
            val frame = upright(image)
            try {
                target(frame)
            } finally {
                frame.recycle()
            }
        } catch (e: Throwable) {
            android.util.Log.e("BirdEye", "Frame failed", e)
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
}
