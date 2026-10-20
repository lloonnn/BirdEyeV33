package com.birdeye

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DecoderTest {
    private val n = 8400

    /** A [1, 6, n] tensor, flat, with every probability 0 and every box empty. */
    private fun empty() = FloatArray(6 * n)

    private fun FloatArray.set(i: Int, cx: Float, cy: Float, w: Float, h: Float, pothole: Float, crack: Float) {
        this[i] = cx; this[n + i] = cy; this[2 * n + i] = w; this[3 * n + i] = h
        this[4 * n + i] = pothole; this[5 * n + i] = crack
    }

    // 960 x 1280 portrait frame in a 640 input: scale 0.5, picture 480 x 640, pad x 80, pad y 0.
    private val box = Letterbox.of(960, 1280, 640)

    @Test fun letterboxValues() {
        assertEquals(0.5f, box.scale, 1e-6f)
        assertEquals(80f, box.padX, 1e-6f)
        assertEquals(0f, box.padY, 1e-6f)
    }

    @Test fun letterboxPaddingFollowsReport() {
        // 640 x 358: scale 1, pad y = round((640 - 358) / 2 - 0.1) = 141.
        val wide = Letterbox.of(640, 358, 640)
        assertEquals(0f, wide.padX, 1e-6f)
        assertEquals(141f, wide.padY, 1e-6f)
        // 100 x 51 scales up by 6.4 to 640 x 326 (rounded): pad y = round(157 - 0.1) = 157. Gain y = 326 / 51, not 6.4.
        val small = Letterbox.of(100, 51, 640)
        assertEquals(640, small.newW)
        assertEquals(326, small.newH)
        assertEquals(157f, small.padY, 1e-6f)
        assertEquals(326f / 51, small.gainY, 1e-6f)
    }

    @Test fun dropsBelowThresholdAndNormalisesAgainstFullFrame() {
        val out = empty()
        out.set(0, 320f, 320f, 160f, 80f, 0.9f, 0.1f) // model space x 240..400, y 280..360
        out.set(1, 100f, 100f, 40f, 40f, 0.2f, 0.1f) // below 0.25
        val d = decode(out, n, box, 0.25, 0.7)
        assertEquals(1, d.size)
        assertEquals(DefectType.Pothole, d[0].type)
        assertEquals(0.9f, d[0].score, 1e-6f)
        // x: (240-80)/0.5 = 320 -> 320/960; (400-80)/0.5 = 640 -> 640/960. y: 280/0.5 = 560 -> 560/1280; 720/1280.
        assertEquals(listOf(320f / 960, 560f / 1280, 640f / 960, 720f / 1280), d[0].bbox.toList())
    }

    @Test fun scoreIsLargerClassAndTypeFollowsIt() {
        val out = empty()
        out.set(0, 320f, 320f, 100f, 100f, 0.3f, 0.6f)
        val d = decode(out, n, box, 0.25, 0.7)
        assertEquals(DefectType.Crack, d[0].type)
        assertEquals(0.6f, d[0].score, 1e-6f)
    }

    @Test fun nmsKeepsBestOfOverlappingSameClass() {
        val out = empty()
        out.set(0, 320f, 320f, 100f, 100f, 0.9f, 0f)
        out.set(1, 324f, 320f, 100f, 100f, 0.7f, 0f) // IoU about 0.92
        val d = decode(out, n, box, 0.25, 0.7)
        assertEquals(1, d.size)
        assertEquals(0.9f, d[0].score, 1e-6f)
    }

    @Test fun nmsIsPerClass() {
        val out = empty()
        out.set(0, 320f, 320f, 100f, 100f, 0.9f, 0f)
        out.set(1, 320f, 320f, 100f, 100f, 0f, 0.8f)
        assertEquals(2, decode(out, n, box, 0.25, 0.7).size)
    }

    @Test fun nmsKeepsBoxesThatOverlapLessThanLimit() {
        val out = empty()
        out.set(0, 300f, 320f, 100f, 100f, 0.9f, 0f)
        out.set(1, 380f, 320f, 100f, 100f, 0.8f, 0f) // IoU 20/180 = 0.11
        assertEquals(2, decode(out, n, box, 0.25, 0.7).size)
    }

    @Test fun clipsBoxesBeyondTheFrame() {
        val out = empty()
        out.set(0, 320f, 620f, 200f, 200f, 0.9f, 0f) // bottom edge at 720 in model space, frame ends at 640
        val d = decode(out, n, box, 0.25, 0.7)
        assertEquals(1f, d[0].bbox[3], 1e-6f)
        assertTrue(d[0].bbox.all { it in 0f..1f })
    }

    @Test fun dropsBoxesEntirelyInThePadding() {
        val out = empty()
        out.set(0, 30f, 320f, 40f, 40f, 0.9f, 0f) // x 10..50, left pad is 0..80
        assertTrue(decode(out, n, box, 0.25, 0.7).isEmpty())
    }
}
