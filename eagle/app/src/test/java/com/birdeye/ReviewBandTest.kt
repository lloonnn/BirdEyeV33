// INVENTED DATA for tests. Not from a real device, road or backend.
package com.birdeye

import org.junit.Assert.assertEquals
import org.junit.Test

class ReviewBandTest {
    private fun record(id: String, band: Band, confidence: Double) = DetectionRecord(
        clientId = id, deviceId = "mock-car-01", capturedAt = "2026-10-20T08:14:22+08:00",
        defectType = DefectType.Pothole, confidence = confidence, band = band,
        bbox = listOf(0.4f, 0.6f, 0.5f, 0.7f), vehicle = Vehicle(3.1834, 101.5139, 4.0, 87.0, 36.0),
        distanceAheadM = 10.0, defectPoint = LatLon(3.1834, 101.5142), modelVersion = "test",
        urgent = false, cropFile = "$id.jpg",
    )

    private fun candidate(id: String, band: Band, confidence: Double, timeMs: Long = 10_000) =
        DupCandidate(id, DefectType.Pothole, timeMs, 3.1834, 101.5142, confidence, uploaded = false, band = band)

    @Test fun scoreBelowSaveMinIsReviewBand() {
        assertEquals(Band.Review, bandFor(0.4f, 0.5))
        assertEquals(Band.Save, bandFor(0.5f, 0.5))
        assertEquals(Band.Save, bandFor(0.9f, 0.5))
    }

    @Test fun reviewRecordIsQueuedAsReviewAndSaveIsUnaffected() {
        val review = QueuedDetection.from(record("r", Band.Review, 0.3), "/tmp/r.jpg", 1_000)
        val save = QueuedDetection.from(record("s", Band.Save, 0.9), "/tmp/s.jpg", 1_000)
        assertEquals("review", review.band)
        assertEquals("save", save.band)
        assertEquals(Band.Review, review.toRecord().band)
        assertEquals(Band.Save, save.toRecord().band)
        assertEquals("review", record("r", Band.Review, 0.3).toJson().getValue("band").toString().trim('"'))
        assertEquals("save", record("s", Band.Save, 0.9).toJson().getValue("band").toString().trim('"'))
    }

    @Test fun reviewAndSaveRecordsDoNotAffectEachOther() {
        val d = { new: DupCandidate, old: DupCandidate -> DuplicateFilter.decide(new, listOf(old), 5.0, 5.0) }
        // A save record next to a review record at the same spot: both are kept, nothing is replaced.
        assertEquals(DupDecision.Keep, d(candidate("s", Band.Save, 0.9), candidate("r", Band.Review, 0.3)))
        assertEquals(DupDecision.Keep, d(candidate("r", Band.Review, 0.3), candidate("s", Band.Save, 0.9)))
    }

    @Test fun twoReviewRecordsKeepTheHighestConfidence() {
        val d = { new: DupCandidate, old: DupCandidate -> DuplicateFilter.decide(new, listOf(old), 5.0, 5.0) }
        assertEquals(DupDecision.Drop, d(candidate("r2", Band.Review, 0.2, 11_000), candidate("r1", Band.Review, 0.3)))
        assertEquals(DupDecision.Replace(listOf("r1")), d(candidate("r2", Band.Review, 0.4, 11_000), candidate("r1", Band.Review, 0.3)))
    }
}
