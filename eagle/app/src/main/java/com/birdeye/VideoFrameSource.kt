package com.birdeye

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File

/** Folder for the two replay files: replay.mp4 and replay_track.json (Android/data/com.birdeye/files). */
fun replayDir(context: Context): File? = context.getExternalFilesDir(null)

/**
 * Replay: reads replay.mp4 from [replayDir] instead of the camera, at frame_rate and at real speed.
 * At the end it starts again or stops, by replay_loop. Frames come from MediaMetadataRetriever, which
 * is slower than a decoder but needs no codec setup; a frame that takes too long makes the next ticks
 * skip, so playback stays at real speed.
 */
class VideoFrameSource(
    private val context: Context,
    private val config: ConfigV0,
    private val settings: AppSettings,
) : FrameSource {
    private val _videoTimeMs = MutableStateFlow<Long?>(null)
    override val videoTimeMs: StateFlow<Long?> = _videoTimeMs

    @Volatile private var thread: Thread? = null

    override fun start(sink: (Bitmap) -> Unit) {
        stop()
        val worker = Thread({ run(sink) }, "birdeye-replay")
        thread = worker
        worker.start()
    }

    override fun stop() {
        thread?.interrupt()
        thread = null
    }

    private fun run(sink: (Bitmap) -> Unit) {
        val file = File(replayDir(context), "replay.mp4")
        if (!file.exists()) {
            Log.e("BirdEye", "Replay: ${file.path} not found")
            return
        }
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.path)
            fun meta(key: Int) = retriever.extractMetadata(key)?.toIntOrNull() ?: 0
            val durationMs = meta(MediaMetadataRetriever.METADATA_KEY_DURATION).toLong()
            val rotation = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
            val unrotatedLandscape = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH) > meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
            if (durationMs <= 0) {
                Log.e("BirdEye", "Replay: cannot read the length of ${file.path}")
                return
            }
            val periodMs = (1000.0 / config.frameRate).toLong()
            var startMs = SystemClock.elapsedRealtime()
            var tick = 0L
            while (!Thread.currentThread().isInterrupted) {
                val atMs = tick * periodMs
                val waitMs = startMs + atMs - SystemClock.elapsedRealtime()
                if (waitMs > 0) Thread.sleep(waitMs)
                val videoMs = SystemClock.elapsedRealtime() - startMs
                if (videoMs >= durationMs) {
                    if (!settings.replayLoop) {
                        _videoTimeMs.value = durationMs
                        return
                    }
                    startMs = SystemClock.elapsedRealtime()
                    tick = 0
                    continue
                }
                _videoTimeMs.value = videoMs
                val raw = retriever.getFrameAtTime(videoMs * 1000, MediaMetadataRetriever.OPTION_CLOSEST)
                if (raw != null) {
                    val frame = upright(raw, rotation, unrotatedLandscape)
                    try {
                        sink(frame)
                    } catch (e: Throwable) {
                        Log.e("BirdEye", "Replay frame failed", e)
                    } finally {
                        frame.recycle()
                    }
                }
                // Skip ticks that are already in the past, so a slow frame does not slow the video down.
                tick = maxOf(tick + 1, (SystemClock.elapsedRealtime() - startMs) / periodMs + 1)
            }
        } catch (e: InterruptedException) {
            // stop() was called
        } catch (e: Exception) {
            Log.e("BirdEye", "Replay failed", e)
        } finally {
            retriever.release()
        }
    }

    /**
     * Makes the frame upright. Some Android versions already rotate the frame and some do not, so a
     * quarter turn is applied only when the bitmap is still in the video's unrotated orientation.
     * A 180 degree turn cannot be detected this way and is assumed to be applied already.
     */
    private fun upright(raw: Bitmap, rotation: Int, unrotatedLandscape: Boolean): Bitmap {
        val quarterTurn = rotation == 90 || rotation == 270
        val stillUnrotated = (raw.width > raw.height) == unrotatedLandscape
        if (!quarterTurn || !stillUnrotated) return raw
        val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
        raw.recycle()
        return rotated
    }
}
