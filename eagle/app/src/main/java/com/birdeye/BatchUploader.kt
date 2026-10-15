package com.birdeye

import java.io.File

/** The queue operations the uploader needs. [DetectionQueue] implements it; tests use a fake. */
interface QueueStore {
    /** Pending rows captured before [capturedBeforeMs], oldest first. */
    suspend fun pendingBatch(limit: Int, capturedBeforeMs: Long): List<QueuedDetection>
    suspend fun hasPending(): Boolean
    suspend fun uploaded(rows: List<QueuedDetection>, atMs: Long)
    suspend fun rejected(rows: List<QueuedDetection>)
    suspend fun failedAttempt(rows: List<QueuedDetection>)
}

/**
 * Sends pending records in batches of [batchSize] to POST /detections/batch, records plus crops.
 * Retry rule from the contract: network errors, 5xx and 429 retry later; any other 4xx is not retried.
 * On a 422 the batch is resent one record at a time, so only the records that fail on their own are
 * marked Rejected. Rejected rows keep their crop file for checking.
 *
 * Only records older than [minAgeMs] (duplicate_time_s) are sent. Reason: a better duplicate can still
 * arrive inside the window and replace a younger record, and an uploaded record cannot be replaced.
 */
class BatchUploader(
    private val api: BirdEyeApi,
    private val store: QueueStore,
    private val batchSize: Int,
    private val minAgeMs: Long,
    private val now: () -> Long = System::currentTimeMillis,
    private val log: (String) -> Unit = {},
) {
    enum class Outcome {
        /** Nothing left to send. */
        Done,
        /** Everything old enough was sent; younger records wait for the next run. */
        DoneYoungerWaiting,
        /** A temporary failure: try again later. */
        Retry,
    }

    suspend fun run(): Outcome {
        while (true) {
            val rows = store.pendingBatch(batchSize, capturedBeforeMs = now() - minAgeMs)
            if (rows.isEmpty()) return if (store.hasPending()) Outcome.DoneYoungerWaiting else Outcome.Done
            try {
                send(rows)
            } catch (e: ApiError) {
                store.failedAttempt(rows)
                if (e.retryable) {
                    log("Upload failed, will retry: ${e.message}")
                    return Outcome.Retry
                }
                if (e.httpStatus == 422 && rows.size > 1) {
                    log("Batch of ${rows.size} got 422, resending one at a time")
                    for (row in rows) {
                        try {
                            send(listOf(row))
                        } catch (single: ApiError) {
                            if (single.retryable) return Outcome.Retry
                            reject(listOf(row), single)
                        }
                    }
                } else {
                    reject(rows, e)
                }
            }
        }
    }

    private suspend fun send(rows: List<QueuedDetection>) {
        val batch = DetectionBatch(
            records = rows.map { it.toRecord() },
            // A missing crop file is left out; the backend then rejects that record with 422.
            crops = rows.mapNotNull { row -> File(row.cropPath).takeIf { it.exists() }?.let { row.cropFile to it } }.toMap(),
        )
        val result = api.uploadDetections(batch)
        store.uploaded(rows, now())
        log("Uploaded ${rows.size}: accepted ${result.accepted}, duplicates ${result.duplicates}")
    }

    private suspend fun reject(rows: List<QueuedDetection>, e: ApiError) {
        store.rejected(rows)
        rows.forEach { log("Rejected ${it.clientId} (${e.httpStatus}): ${e.message}") }
    }
}
