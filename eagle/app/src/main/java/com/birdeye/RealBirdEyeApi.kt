package com.birdeye

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * The backend client, api-contract.md v0. [baseUrl] is birdeye.baseUrl from local.properties.
 * Failures throw [ApiError]: httpStatus is null for a network error, so the uploader's retry rule applies.
 */
class RealBirdEyeApi(
    baseUrl: String,
    private val log: (String) -> Unit = {},
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build(),
) : BirdEyeApi {
    private val base = baseUrl.trimEnd('/')
    private val json = "application/json".toMediaType()
    private val jpeg = "image/jpeg".toMediaType()

    override suspend fun getConfig(): ConfigV0 =
        parseConfig(call(Request.Builder().url("$base/config").get().build()).let { Json.parseToJsonElement(it).jsonObject })

    override suspend fun uploadDetections(batch: DetectionBatch): BatchResult {
        val records = JsonArray(batch.records.map { it.toJson() }).toString()
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("records", null, records.toRequestBody(json))
        for ((part, file) in batch.crops) body.addFormDataPart(part, part, file.asRequestBody(jpeg))
        val text = call(Request.Builder().url("$base/detections/batch").post(body.build()).build())
        return parseBatchResult(Json.parseToJsonElement(text).jsonObject).also {
            log("POST /detections/batch: accepted ${it.accepted}, duplicates ${it.duplicates}")
        }
    }

    override suspend fun sendHeartbeat(heartbeat: Heartbeat) {
        call(postJson("/heartbeat", heartbeat.toJson().toString()))
    }

    override suspend fun uploadTrack(track: TrackUpload) {
        call(postJson("/tracks", track.toJson().toString()))
    }

    private fun postJson(path: String, body: String): Request =
        Request.Builder().url("$base$path").post(body.toRequestBody(json)).build()

    /** Runs the request off the caller's thread. Returns the body text of a 2xx answer. */
    private suspend fun call(request: Request): String = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body.string()
                if (!response.isSuccessful) {
                    throw ApiError(response.code, "${request.method} ${request.url.encodedPath}: ${response.code} ${text.take(300)}")
                }
                text
            }
        } catch (e: IOException) {
            throw ApiError(null, "${request.method} ${request.url.encodedPath}: ${e.message}")
        }
    }
}
