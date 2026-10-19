package com.birdeye

/**
 * Every backend call the phone makes, one method per phone endpoint in api-contract.md v0.
 * Get an instance from [Api.get]; no other code knows whether it is the mock or the real client.
 * Failures throw [ApiError]. There is no model download: config sync downloads are cut until after 23 Oct.
 */
interface BirdEyeApi {
    /** `GET /config`. */
    suspend fun getConfig(): ConfigV0

    /** `POST /detections/batch`, multipart: records plus crops. Returns 200 `{ accepted, duplicates }`. */
    suspend fun uploadDetections(batch: DetectionBatch): BatchResult

    /** `POST /heartbeat`. Returns 204. */
    suspend fun sendHeartbeat(heartbeat: Heartbeat)

    /** `POST /tracks`. Returns 204. */
    suspend fun uploadTrack(track: TrackUpload)
}
