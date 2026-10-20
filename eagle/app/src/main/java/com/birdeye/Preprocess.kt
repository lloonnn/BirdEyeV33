package com.birdeye

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.core.graphics.createBitmap
import java.nio.FloatBuffer
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * How a frame was fitted into the square model input, kept so box coordinates can be mapped back.
 * The frame is resized to [newW] x [newH] and pasted at ([padX], [padY]). A source pixel (x, y) lands at
 * (x * gainX + padX, y * gainY + padY). Same rule as the training report (tflite_conventions.preprocessing).
 */
data class Letterbox(val scale: Float, val padX: Float, val padY: Float, val srcW: Int, val srcH: Int, val newW: Int, val newH: Int) {
    val gainX get() = newW.toFloat() / srcW
    val gainY get() = newH.toFloat() / srcH

    companion object {
        /** Scale is size / longest side (scaling up is allowed); padding is round((size - new) / 2 - 0.1). */
        fun of(srcW: Int, srcH: Int, size: Int): Letterbox {
            val scale = min(size.toFloat() / srcW, size.toFloat() / srcH)
            val w = (srcW * scale).roundToInt()
            val h = (srcH * scale).roundToInt()
            return Letterbox(scale, ((size - w) / 2f - 0.1f).roundToInt().toFloat(), ((size - h) / 2f - 0.1f).roundToInt().toFloat(), srcW, srcH, w, h)
        }
    }
}

/** Grey used to pad the letterbox, as a fraction of 255. Starting value from the training pipeline. */
private const val PAD_GREY = 114

/**
 * The only place that turns a camera frame into model input. The next model may change this rule, so
 * nothing else may assume it. Current rule: keep the aspect ratio, pad to a square with grey 114/255,
 * order RGB, values 0 to 1, row by row (NHWC). Writes size * size * 3 floats to [out] and returns the
 * letterbox used.
 */
fun preprocess(frame: Bitmap, size: Int, out: FloatBuffer): Letterbox {
    val box = Letterbox.of(frame.width, frame.height, size)
    val canvasBitmap = createBitmap(size, size)
    canvasBitmap.eraseColor(Color.rgb(PAD_GREY, PAD_GREY, PAD_GREY))
    val dst = android.graphics.RectF(
        box.padX, box.padY, box.padX + box.newW, box.padY + box.newH,
    )
    Canvas(canvasBitmap).drawBitmap(frame, null, dst, Paint(Paint.FILTER_BITMAP_FLAG))
    val pixels = IntArray(size * size)
    canvasBitmap.getPixels(pixels, 0, size, 0, 0, size, size)
    canvasBitmap.recycle()
    out.rewind()
    for (p in pixels) {
        out.put(Color.red(p) / 255f)
        out.put(Color.green(p) / 255f)
        out.put(Color.blue(p) / 255f)
    }
    out.rewind()
    return box
}
