// INVENTED DATA for tests. Not from a real device, road or backend.
package com.birdeye

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Rows written to the queue are still there after the database is closed and opened again. */
@RunWith(AndroidJUnit4::class)
class QueueDbPersistenceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val name = "queue-persistence-test.db"

    private fun open() = Room.databaseBuilder(context, QueueDb::class.java, name).build()

    @Before fun clean() { context.deleteDatabase(name) }

    @After fun tidy() { context.deleteDatabase(name) }

    @Test fun rowsSurviveCloseAndReopen() = runBlocking {
        val record = DetectionRecord(
            clientId = "3f6c9e2a-0000-4000-8000-000000000001",
            deviceId = "mock-car-01",
            capturedAt = "2026-10-16T08:14:22+08:00",
            defectType = DefectType.Crack,
            confidence = 0.91,
            band = Band.Save,
            bbox = listOf(412, 588, 506, 640),
            vehicle = Vehicle(3.1834, 101.5139, 4.2, 87.0, 36.0),
            distanceAheadM = 14.5,
            defectPoint = LatLon(3.1834, 101.5142),
            modelVersion = "mock-fake-detection",
            urgent = false,
            cropFile = "3f6c9e2a.jpg",
        )
        open().apply {
            dao().insert(QueuedDetection.from(record, "/tmp/3f6c9e2a.jpg", 1_000L))
            close()
        }
        val reopened = open()
        val rows = reopened.dao().pendingBatch(10)
        assertEquals(1, reopened.dao().pendingCount().first())
        assertEquals(record, rows.single().toRecord())
        reopened.close()
    }

    @Test fun pruneDeletesOnlyLogEntriesOlderThanCutoff() = runBlocking {
        val db = open()
        val now = 10L * 86_400_000L
        listOf("old" to now - 3 * 86_400_000L, "recent" to now - 86_400_000L).forEach { (id, t) ->
            db.dao().insertLog(DetectionLogEntry(id, "pothole", t, 3.1834, 101.5139, 0.9, uploadedAtMs = null))
        }
        assertEquals(1, db.dao().deleteLogBefore(logPruneCutoffMs(now, keepDays = 2.0)))
        assertEquals(listOf("recent"), db.dao().logSince(0).map { it.clientId })
        db.close()
    }
}
