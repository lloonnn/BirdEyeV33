package com.birdeye

import org.junit.Assert.assertEquals
import org.junit.Test

class DuplicateFilterTest {
    private val distanceM = 5.0
    private val timeS = 5.0

    // 0.00001 degrees of latitude is about 1.1 m.
    private fun candidate(
        id: String,
        timeMs: Long,
        latOffsetM: Double = 0.0,
        confidence: Double = 0.85,
        type: DefectType = DefectType.Pothole,
        uploaded: Boolean = false,
    ) = DupCandidate(id, type, timeMs, 3.1834 + latOffsetM / 111_320.0, 101.5139, confidence, uploaded)

    private fun decide(new: DupCandidate, vararg recent: DupCandidate) =
        DuplicateFilter.decide(new, recent.toList(), distanceM, timeS)

    @Test fun keepsWhenNothingRecent() =
        assertEquals(DupDecision.Keep, decide(candidate("new", 10_000)))

    @Test fun dropsLowerConfidenceInsideWindow() =
        assertEquals(DupDecision.Drop, decide(candidate("new", 12_000, 2.0, 0.81), candidate("old", 10_000, confidence = 0.90)))

    @Test fun dropsEqualConfidenceInsideWindow() =
        assertEquals(DupDecision.Drop, decide(candidate("new", 12_000, confidence = 0.9), candidate("old", 10_000, confidence = 0.9)))

    @Test fun replacesWhenNewIsHigher() =
        assertEquals(
            DupDecision.Replace(listOf("old")),
            decide(candidate("new", 12_000, 2.0, 0.95), candidate("old", 10_000, confidence = 0.85)),
        )

    @Test fun keepsWhenTooFarApart() =
        assertEquals(DupDecision.Keep, decide(candidate("new", 12_000, 6.0), candidate("old", 10_000)))

    @Test fun keepsWhenOutsideTimeWindow() =
        assertEquals(DupDecision.Keep, decide(candidate("new", 15_001), candidate("old", 10_000)))

    @Test fun keepsDifferentDefectType() =
        assertEquals(DupDecision.Keep, decide(candidate("new", 12_000, type = DefectType.Crack), candidate("old", 10_000)))

    @Test fun dropsWhenDuplicateAlreadyUploaded() =
        assertEquals(
            DupDecision.Drop,
            decide(candidate("new", 12_000, confidence = 0.99), candidate("old", 10_000, confidence = 0.8, uploaded = true)),
        )

    @Test fun fiveTapsWithTwoInsideWindowKeepFour() {
        // Taps at 0, 10, 20, 30 and 32 s at the same spot: the last two are one duplicate pair.
        val kept = mutableListOf<DupCandidate>()
        val times = listOf(0L, 10_000L, 20_000L, 30_000L, 32_000L)
        val confidences = listOf(0.85, 0.85, 0.85, 0.85, 0.82)
        times.zip(confidences).forEachIndexed { i, (t, c) ->
            val new = candidate("tap$i", t, confidence = c)
            when (val d = DuplicateFilter.decide(new, kept, distanceM, timeS)) {
                DupDecision.Keep -> kept += new
                DupDecision.Drop -> Unit
                is DupDecision.Replace -> { kept.removeAll { it.clientId in d.clientIds }; kept += new }
            }
        }
        assertEquals(4, kept.size)
    }

    @Test fun distanceIsAboutRight() {
        val d = DuplicateFilter.distanceMetres(3.1834, 101.5139, 3.1834 + 10 / 111_320.0, 101.5139)
        assertEquals(10.0, d, 0.1)
    }
}
