// INVENTED DATA for development. Not from a real device, road or backend.
package com.birdeye

/**
 * Stands in for the backend until phase 3. It keeps the client_ids it has seen in memory, so a repeated
 * client_id counts as a duplicate, as the contract says. [failUploads] makes every call fail with a
 * retryable 503, to test the queue's retries. [log] is injected so the class runs in JVM unit tests.
 */
class MockBirdEyeApi(
    private val failUploads: () -> Boolean = { false },
    private val log: (String) -> Unit = {},
) : BirdEyeApi {
    private val seenClientIds = mutableSetOf<String>()

    override suspend fun getConfig(): ConfigV0 {
        failIfSet()
        return ConfigV0(
            modelVersion = "mock-m-0000",
            modelSha256 = "0000000000000000000000000000000000000000000000000000000000000000",
            frameRate = 3.0,
            inputSizePx = 640,
            bandSaveMin = 0.8,
            bandReviewMin = 0.3,
            cropLongSidePx = 640,
            gpsIntervalS = 1.0,
            heartbeatIntervalS = 60.0,
            uploadIntervalS = 900.0,
            duplicateDistanceM = 5.0,
            duplicateTimeS = 5.0,
        )
    }

    override suspend fun uploadDetections(batch: DetectionBatch): BatchResult {
        failIfSet()
        // Like the real backend, one invalid record rejects the whole batch with 422.
        batch.records.firstOrNull { it.cropFile !in batch.crops }?.let {
            throw ApiError(422, "record ${it.clientId} has no crop part named ${it.cropFile}")
        }
        var accepted = 0
        var duplicates = 0
        synchronized(seenClientIds) {
            for (record in batch.records) {
                if (seenClientIds.add(record.clientId)) accepted++ else duplicates++
            }
        }
        log("MOCK POST /detections/batch: accepted $accepted, duplicates $duplicates")
        batch.records.forEach { log("MOCK received ${it.clientId} confidence ${"%.2f".format(it.confidence)}") }
        return BatchResult(accepted, duplicates)
    }

    override suspend fun sendHeartbeat(heartbeat: Heartbeat) {
        failIfSet()
        log("MOCK POST /heartbeat: ${heartbeat.state.wire}")
    }

    override suspend fun uploadTrack(track: TrackUpload) {
        failIfSet()
        log("MOCK POST /tracks: ${track.points.size} points")
    }

    private fun failIfSet() {
        if (failUploads()) throw ApiError(503, "MOCK: set to fail")
    }
}
