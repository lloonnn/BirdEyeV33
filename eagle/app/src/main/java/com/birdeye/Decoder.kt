package com.birdeye

import kotlin.math.max
import kotlin.math.min

/**
 * One detection. [bbox] is [x1, y1, x2, y2], floats 0 to 1 against the full camera frame, origin top
 * left (15 Oct decision). This is the format the record's `bbox` field carries.
 */
data class Detection(val type: DefectType, val score: Float, val bbox: FloatArray)

/**
 * Turns the raw model output into detections. [output] is the flat [1, 6, n] tensor: rows 0 to 3 are
 * centre x, centre y, width and height in pixels of the model input, rows 4 and 5 are the pothole and
 * crack probabilities. The model has no NMS, so this does it, once per class.
 *
 * Order: score is the larger class probability; drop scores below [reviewMin]; per-class NMS at
 * [nmsIou]; undo the letterbox; clip to the frame; divide by the frame size.
 */
fun decode(output: FloatArray, n: Int, box: Letterbox, reviewMin: Double, nmsIou: Double): List<Detection> {
    class Candidate(val type: DefectType, val score: Float, val x1: Float, val y1: Float, val x2: Float, val y2: Float)

    val candidates = ArrayList<Candidate>()
    for (i in 0 until n) {
        val pothole = output[4 * n + i]
        val crack = output[5 * n + i]
        val score = max(pothole, crack)
        if (score < reviewMin) continue
        val cx = output[i]
        val cy = output[n + i]
        val w = output[2 * n + i]
        val h = output[3 * n + i]
        candidates += Candidate(
            if (pothole >= crack) DefectType.Pothole else DefectType.Crack,
            score, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2,
        )
    }

    val kept = ArrayList<Candidate>()
    for (type in DefectType.entries) {
        val sorted = candidates.filter { it.type == type }.sortedByDescending { it.score }
        val chosen = ArrayList<Candidate>()
        for (c in sorted) {
            if (chosen.none { iou(it.x1, it.y1, it.x2, it.y2, c.x1, c.y1, c.x2, c.y2) > nmsIou }) chosen += c
        }
        kept += chosen
    }

    val result = ArrayList<Detection>()
    for (c in kept.sortedByDescending { it.score }) {
        val x1 = ((c.x1 - box.padX) / box.scale).coerceIn(0f, box.srcW.toFloat())
        val y1 = ((c.y1 - box.padY) / box.scale).coerceIn(0f, box.srcH.toFloat())
        val x2 = ((c.x2 - box.padX) / box.scale).coerceIn(0f, box.srcW.toFloat())
        val y2 = ((c.y2 - box.padY) / box.scale).coerceIn(0f, box.srcH.toFloat())
        if (x2 <= x1 || y2 <= y1) continue // entirely in the padding or outside the frame
        result += Detection(c.type, c.score, floatArrayOf(x1 / box.srcW, y1 / box.srcH, x2 / box.srcW, y2 / box.srcH))
    }
    return result
}

private fun iou(ax1: Float, ay1: Float, ax2: Float, ay2: Float, bx1: Float, by1: Float, bx2: Float, by2: Float): Float {
    val iw = min(ax2, bx2) - max(ax1, bx1)
    val ih = min(ay2, by2) - max(ay1, by1)
    if (iw <= 0f || ih <= 0f) return 0f
    val inter = iw * ih
    return inter / ((ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter)
}

/** The highest class probability in the raw output, with its class, before any threshold. */
fun topScore(output: FloatArray, n: Int): Pair<DefectType, Float> {
    var best = 0f
    var type = DefectType.Pothole
    for (i in 0 until n) {
        if (output[4 * n + i] > best) { best = output[4 * n + i]; type = DefectType.Pothole }
        if (output[5 * n + i] > best) { best = output[5 * n + i]; type = DefectType.Crack }
    }
    return type to best
}
