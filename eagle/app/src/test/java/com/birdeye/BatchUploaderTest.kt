// INVENTED DATA for tests. Not from a real device, road or backend.
package com.birdeye

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class BatchUploaderTest {
    @get:Rule val tmp = TemporaryFolder()

    /** In-memory queue that applies the duplicate filter like DetectionQueue does. */
    private class FakeStore(private val distanceM: Double = 5.0, private val timeS: Double = 5.0) : QueueStore {
        val rows = mutableListOf<QueuedDetection>()
        val uploaded = mutableListOf<QueuedDetection>()

        fun add(row: QueuedDetection) {
            val new = DupCandidate(row.clientId, DefectType.Pothole, row.capturedAtMs, row.defectLat, row.defectLon, row.confidence, false)
            val recent = rows.map { DupCandidate(it.clientId, DefectType.Pothole, it.capturedAtMs, it.defectLat, it.defectLon, it.confidence, false) }
            when (val d = DuplicateFilter.decide(new, recent, distanceM, timeS)) {
                DupDecision.Keep -> rows += row
                DupDecision.Drop -> Unit
                is DupDecision.Replace -> { rows.removeAll { it.clientId in d.clientIds }; rows += row }
            }
        }

        override suspend fun pendingBatch(limit: Int, capturedBeforeMs: Long) =
            rows.filter { it.queueState == QueueState.Pending && it.capturedAtMs < capturedBeforeMs }
                .sortedBy { it.capturedAtMs }.take(limit)
        override suspend fun hasPending() = rows.any { it.queueState == QueueState.Pending }
        override suspend fun uploaded(rows: List<QueuedDetection>, atMs: Long) {
            uploaded += rows
            this.rows.removeAll { r -> rows.any { it.clientId == r.clientId } }
        }
        override suspend fun rejected(rows: List<QueuedDetection>) {
            val ids = rows.map { it.clientId }.toSet()
            this.rows.replaceAll { if (it.clientId in ids) it.copy(queueState = QueueState.Rejected) else it }
        }
        override suspend fun failedAttempt(rows: List<QueuedDetection>) = Unit
    }

    private fun row(id: String, timeMs: Long, confidence: Double = 0.85, withCrop: Boolean = true): QueuedDetection {
        val crop = File(tmp.root, "$id.jpg").apply { if (withCrop) writeBytes(byteArrayOf(1, 2, 3)) }
        val record = DetectionRecord(
            clientId = id, deviceId = "mock-car-01", capturedAt = "2026-10-16T08:14:22+08:00",
            defectType = DefectType.Pothole, confidence = confidence, band = Band.Save,
            bbox = listOf(0.42f, 0.62f, 0.54f, 0.71f), vehicle = Vehicle(3.1834, 101.5139, 4.0, 0.0, 0.0),
            distanceAheadM = 10.0, defectPoint = LatLon(3.1834, 101.5140), modelVersion = "mock-fake-detection",
            urgent = false, cropFile = "$id.jpg",
        )
        return QueuedDetection.from(record, crop.path, timeMs)
    }

    @Test fun batchWith422ResendsOneByOneAndRejectsOnlyTheBadRecord() = runBlocking {
        val store = FakeStore(distanceM = 0.0) // no duplicates in this test
        store.rows += row("a", 0)
        store.rows += row("bad", 10_000, withCrop = false) // missing crop: the backend answers 422
        store.rows += row("c", 20_000)

        val outcome = BatchUploader(MockBirdEyeApi(), store, batchSize = 50, minAgeMs = 5_000).run()

        assertEquals(BatchUploader.Outcome.Done, outcome)
        assertEquals(listOf("a", "c"), store.uploaded.map { it.clientId })
        assertEquals(listOf("bad"), store.rows.filter { it.queueState == QueueState.Rejected }.map { it.clientId })
        assertTrue("rejected record keeps its crop path", store.rows.single().cropPath.endsWith("bad.jpg"))
    }

    @Test fun betterDuplicateInsideWindowReplacesFirstBeforeUpload() = runBlocking {
        val store = FakeStore()
        val config = MockBirdEyeApi().getConfig()
        // First record at 0 s; a better one at 3 s, the same spot. The one-off upload waits
        // duplicate_time_s + 2 s, so it runs after the second record has arrived.
        store.add(row("first", 0, confidence = 0.82))
        val secondAtS = 3L
        assertTrue(Uploads.oneOffDelayS(config) > secondAtS)
        store.add(row("second", secondAtS * 1000, confidence = 0.90))

        BatchUploader(MockBirdEyeApi(), store, batchSize = 50, minAgeMs = 5_000).run()

        assertEquals(listOf("second"), store.uploaded.map { it.clientId })
        assertEquals(0.90, store.uploaded.single().confidence, 1e-9)
    }

    @Test fun onlyRecordsOlderThanTheWindowUpload() = runBlocking {
        val store = FakeStore()
        // Put straight into the queue: this test is about upload timing, not the duplicate filter.
        store.rows += row("at0s", 0)
        store.rows += row("at5s", 5_000)
        var clock = 7_000L
        val uploader = BatchUploader(MockBirdEyeApi(), store, batchSize = 50, minAgeMs = 5_000, now = { clock })

        // At 7 s only records captured before 2 s may go.
        assertEquals(BatchUploader.Outcome.DoneYoungerWaiting, uploader.run())
        assertEquals(listOf("at0s"), store.uploaded.map { it.clientId })

        // The follow-up run, one delay (duplicate_time_s + 2 s) later.
        clock += Uploads.oneOffDelayS(MockBirdEyeApi().getConfig()) * 1000
        assertEquals(BatchUploader.Outcome.Done, uploader.run())
        assertEquals(listOf("at0s", "at5s"), store.uploaded.map { it.clientId })
    }

    @Test fun pruningCutoffIsTwoDaysBeforeNow() {
        val now = 10L * 24 * 60 * 60 * 1000
        val cutoff = logPruneCutoffMs(now, keepDays = 2.0)
        val entries = mapOf("3 days old" to now - 3 * 86_400_000L, "1 day old" to now - 86_400_000L, "now" to now)
        val kept = entries.filterValues { it >= cutoff }.keys // the DAO deletes capturedAtMs < cutoff
        assertEquals(setOf("1 day old", "now"), kept)
    }
}
