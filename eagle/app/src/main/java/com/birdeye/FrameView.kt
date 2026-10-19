package com.birdeye

import android.graphics.Bitmap
import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import kotlin.math.max
import kotlin.math.min

/** Where a frame of [frameW] x [frameH] lands in a view: fitted inside it, or filling it (cropped) like FILL_CENTER. */
private fun placement(viewW: Float, viewH: Float, frameW: Int, frameH: Int, fill: Boolean): Triple<Float, Float, Float> {
    val scale = if (fill) max(viewW / frameW, viewH / frameH) else min(viewW / frameW, viewH / frameH)
    return Triple(scale, (viewW - frameW * scale) / 2, (viewH - frameH * scale) / 2)
}

/** The replayed video frame, fitted inside the area. */
@Composable
fun ReplayFrame(frame: Bitmap?, modifier: Modifier = Modifier) {
    val image = remember(frame) { frame?.asImageBitmap() }
    Canvas(modifier) {
        if (image == null) return@Canvas
        val (scale, dx, dy) = placement(size.width, size.height, image.width, image.height, fill = false)
        drawImage(
            image,
            dstOffset = IntOffset(dx.toInt(), dy.toInt()),
            dstSize = IntSize((image.width * scale).toInt(), (image.height * scale).toInt()),
        )
    }
}

/**
 * Boxes of the last frame over the picture, with their scores. Green is the save band (at least
 * [saveMin]), amber the review band. [fill] is true over the camera preview, which fills its area;
 * false over the replay frame, which is fitted.
 */
@Composable
fun DetectionBoxes(stats: PipelineStats, saveMin: Double, fill: Boolean, modifier: Modifier = Modifier) {
    val label = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 36f; color = android.graphics.Color.WHITE; setShadowLayer(4f, 0f, 0f, android.graphics.Color.BLACK) } }
    Canvas(modifier) {
        if (stats.frameW == 0 || stats.frameH == 0) return@Canvas
        val (scale, dx, dy) = placement(size.width, size.height, stats.frameW, stats.frameH, fill)
        for (d in stats.boxes) {
            val x1 = dx + d.bbox[0] * stats.frameW * scale
            val y1 = dy + d.bbox[1] * stats.frameH * scale
            val x2 = dx + d.bbox[2] * stats.frameW * scale
            val y2 = dy + d.bbox[3] * stats.frameH * scale
            drawRect(
                if (d.score >= saveMin) Color(0xFF22C55E) else Color(0xFFF59E0B),
                Offset(x1, y1), Size(x2 - x1, y2 - y1), style = Stroke(width = 4f),
            )
            drawContext.canvas.nativeCanvas.drawText("%s %.2f".format(d.type.wire, d.score), x1, max(y1 - 8f, 36f), label)
        }
    }
}
