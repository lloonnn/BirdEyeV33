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
 * A source pixel (x, y) lands at (x * scale + padX, y * scale + padY) in the input.
 */
data class Letterbox(val scale: Float, val padX: Float, val padY: Float, val srcW: Int, val srcH: Int) {
    companion object {
        fun of(srcW: Int, srcH: Int, size: Int): Letterbox {
            val scale = min(size.toFloat() / srcW, size.toFloat() / srcH)
            val w = (srcW * scale).roundToInt()
            val h = (srcH * scale).roundToInt()
            return Letterbox(scale, ((size - w) / 2).toFloat(), ((size - h) / 2).toFloat(), srcW, srcH)
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
        box.padX, box.padY, box.padX + frame.width * box.scale, box.padY + frame.height * box.scale,
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
