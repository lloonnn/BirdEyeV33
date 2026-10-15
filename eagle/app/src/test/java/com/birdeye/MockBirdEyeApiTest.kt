// INVENTED DATA for tests. Not from a real device, road or backend.
package com.birdeye

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

class MockBirdEyeApiTest {
    private fun record(id: String) = DetectionRecord(
        clientId = id,
        deviceId = "mock-car-01",
        capturedAt = "2026-10-16T08:14:22+08:00",
        defectType = DefectType.Pothole,
        confidence = 0.9,
        band = Band.Save,
        bbox = listOf(0.42f, 0.62f, 0.54f, 0.71f),
        vehicle = Vehicle(3.1834, 101.5139, 4.0, 87.0, 30.0),
        distanceAheadM = 10.0,
        defectPoint = LatLon(3.1834, 101.5140),
        modelVersion = "mock-fake-detection",
        urgent = false,
        cropFile = "$id.jpg",
    )

    private fun batch(vararg ids: String) =
        DetectionBatch(ids.map { record(it) }, ids.associate { "$it.jpg" to File("$it.jpg") })

    @Test fun countsRepeatedClientIdAsDuplicate() = runBlocking {
        val api = MockBirdEyeApi()
        assertEquals(BatchResult(accepted = 2, duplicates = 0), api.uploadDetections(batch("a", "b")))
        assertEquals(BatchResult(accepted = 1, duplicates = 2), api.uploadDetections(batch("a", "b", "c")))
    }

    @Test fun failSettingThrowsRetryableError() = runBlocking {
        val api = MockBirdEyeApi(failUploads = { true })
        try {
            api.uploadDetections(batch("a"))
            fail("expected ApiError")
        } catch (e: ApiError) {
            assertTrue(e.retryable)
        }
    }

    @Test fun missingCropRejectsWholeBatchWith422() = runBlocking {
        val api = MockBirdEyeApi()
        val broken = DetectionBatch(listOf(record("a"), record("b")), mapOf("a.jpg" to File("a.jpg")))
        try {
            api.uploadDetections(broken)
            fail("expected ApiError")
        } catch (e: ApiError) {
            assertEquals(422, e.httpStatus)
            assertTrue(!e.retryable)
        }
        // Nothing from the rejected batch was stored, so both still count as new.
        assertEquals(BatchResult(accepted = 2, duplicates = 0), api.uploadDetections(batch("a", "b")))
    }
}
