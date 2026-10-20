package com.birdeye

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/** Folder for the two replay files: replay.mp4 and replay_track.json (Android/data/com.birdeye/files). */
fun replayDir(context: Context): File? = context.getExternalFilesDir(null)

/**
 * Replay: reads replay.mp4 from [replayDir] instead of the camera, at frame_rate and at real speed.
 * At the end it starts again or stops, by replay_loop.
 *
 * Frames are decoded at reduced size (long side at most [MAX_SIDE_PX]). MediaMetadataRetriever can be
 * slow, so first a few frames are timed. At [MIN_LIVE_FPS] or more the video is decoded live. Below
 * that, every sampled frame is decoded once at shift start, written to a JPEG cache with a progress
 * line, and played from there. The cache is reused while the video and frame_rate stay the same.
 * It holds test footage only, in the app's cache folder, which Android may clear.
 */
class VideoFrameSource(
    private val context: Context,
    private val config: ConfigV0,
    private val settings: AppSettings,
) : FrameSource {
    private val _videoTimeMs = MutableStateFlow<Long?>(null)
    override val videoTimeMs: StateFlow<Long?> = _videoTimeMs
    private val _status = MutableStateFlow<String?>(null)
    override val status: StateFlow<String?> = _status
    private val _displayFrame = MutableStateFlow<Bitmap?>(null)
    override val displayFrame: StateFlow<Bitmap?> = _displayFrame

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
            _status.value = "replay.mp4 not found"
            return
        }
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(file.path)
            fun meta(key: Int) = retriever.extractMetadata(key)?.toIntOrNull() ?: 0
            val durationMs = meta(MediaMetadataRetriever.METADATA_KEY_DURATION).toLong()
            if (durationMs <= 0) {
                Log.e("BirdEye", "Replay: cannot read the length of ${file.path}")
                _status.value = "cannot read replay.mp4"
                return
            }
            val periodMs = (1000.0 / config.frameRate).toLong()
            val grabber = Grabber(retriever, meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION),
                meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH) > meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT))

            val liveFps = grabber.probeFps(durationMs, periodMs)
            val frameCount = ((durationMs + periodMs - 1) / periodMs).toInt()
            var cache: File? = null
            if (liveFps < MIN_LIVE_FPS) {
                cache = prepareCache(file, grabber, frameCount, periodMs, liveFps)
                if (cache == null) return
            } else {
                _status.value = "Replay: live decode %.1f fps".format(liveFps)
                Log.i("BirdEye", "Replay: live decode %.1f fps".format(liveFps))
            }

            var startMs = SystemClock.elapsedRealtime()
            var tick = 0L
            while (!Thread.currentThread().isInterrupted) {
                val waitMs = startMs + tick * periodMs - SystemClock.elapsedRealtime()
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
                val frame = if (cache != null) {
                    BitmapFactory.decodeFile(File(cache, "%05d.jpg".format((videoMs / periodMs).toInt().coerceAtMost(frameCount - 1))).path)
                } else {
                    grabber.grab(videoMs)
                }
                if (frame != null) {
                    // Not recycled: the screen may still be drawing it. The garbage collector frees it.
                    _displayFrame.value = frame
                    try {
                        sink(frame)
                    } catch (e: Throwable) {
                        Log.e("BirdEye", "Replay frame failed", e)
                    }
                }
                // Skip ticks that are already in the past, so a slow frame does not slow the video down.
                tick = max(tick + 1, (SystemClock.elapsedRealtime() - startMs) / periodMs + 1)
            }
        } catch (e: InterruptedException) {
            // stop() was called
        } catch (e: Exception) {
            Log.e("BirdEye", "Replay failed", e)
            _status.value = "replay failed: ${e.message}"
        } finally {
            retriever.release()
        }
    }

    /** Decodes every sampled frame once into the cache folder. Returns the folder, or null if stopped. */
    private fun prepareCache(video: File, grabber: Grabber, frameCount: Int, periodMs: Long, liveFps: Double): File? {
        val dir = File(context.cacheDir, "replay_frames")
        val key = "${video.length()}-${video.lastModified()}-${config.frameRate}-$MAX_SIDE_PX-$frameCount"
        val keyFile = File(dir, "key.txt")
        if (keyFile.exists() && keyFile.readText() == key) {
            _status.value = "Replay: $frameCount cached frames (decode was %.1f fps)".format(liveFps)
            return dir
        }
        dir.deleteRecursively()
        dir.mkdirs()
        val startMs = SystemClock.elapsedRealtime()
        for (i in 0 until frameCount) {
            if (Thread.currentThread().isInterrupted) return null
            _status.value = "Preparing replay: ${i + 1} / $frameCount"
            val frame = grabber.grab(i * periodMs) ?: continue
            FileOutputStream(File(dir, "%05d.jpg".format(i))).use { frame.compress(Bitmap.CompressFormat.JPEG, 90, it) }
            frame.recycle()
        }
        val fps = frameCount * 1000.0 / (SystemClock.elapsedRealtime() - startMs)
        keyFile.writeText(key)
        Log.i("BirdEye", "Replay: cached $frameCount frames at %.1f fps".format(fps))
        _status.value = "Replay: $frameCount cached frames (extracted at %.1f fps)".format(fps)
        return dir
    }

    /**
     * Gets reduced-size upright frames from the retriever. Some Android versions already rotate the
     * frame and some do not, so a quarter turn is applied only when a frame comes back in the video's
     * unrotated orientation (found on the first frame). A 180 degree turn cannot be detected this way
     * and is assumed to be applied already.
     */
    private class Grabber(val retriever: MediaMetadataRetriever, val rotation: Int, val unrotatedLandscape: Boolean) {
        private var outW = 0
        private var outH = 0
        private var swapDims = false
        private var rotate = false

        private fun learn() {
            val first = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST) ?: error("no first frame")
            val quarter = rotation == 90 || rotation == 270
            rotate = quarter && (first.width > first.height) == unrotatedLandscape
            val scale = minOf(1f, MAX_SIDE_PX.toFloat() / max(first.width, first.height))
            outW = max(1, (first.width * scale).roundToInt())
            outH = max(1, (first.height * scale).roundToInt())
            first.recycle()
            // Check whether the scaled call takes sizes in the orientation it returns.
            if (Build.VERSION.SDK_INT >= 27) {
                val test = retriever.getScaledFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST, outW, outH)
                swapDims = test != null && (test.width > test.height) != (outW > outH)
                test?.recycle()
            }
        }

        fun grab(tMs: Long): Bitmap? {
            if (outW == 0) learn()
            val raw = if (Build.VERSION.SDK_INT >= 27) {
                retriever.getScaledFrameAtTime(
                    tMs * 1000, MediaMetadataRetriever.OPTION_CLOSEST,
                    if (swapDims) outH else outW, if (swapDims) outW else outH,
                )
            } else {
                retriever.getFrameAtTime(tMs * 1000, MediaMetadataRetriever.OPTION_CLOSEST)?.let {
                    val s = Bitmap.createScaledBitmap(it, outW, outH, true)
                    if (s !== it) it.recycle()
                    s
                }
            } ?: return null
            if (!rotate) return raw
            val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
            raw.recycle()
            return rotated
        }

        /** Frames per second of [grab] over a few frames spread through the video. */
        fun probeFps(durationMs: Long, periodMs: Long): Double {
            grab(0)?.recycle() // the first call also learns sizes; keep that out of the timing
            val n = 4
            val start = SystemClock.elapsedRealtime()
            for (i in 1..n) grab((durationMs - 1) * i / (n + 1) / periodMs * periodMs)?.recycle()
            return n * 1000.0 / max(1L, SystemClock.elapsedRealtime() - start)
        }
    }

    companion object {
        const val MAX_SIDE_PX = 720

        /** Below this decode speed the frames are cached first. Starting value. */
        const val MIN_LIVE_FPS = 3.0
    }
}
