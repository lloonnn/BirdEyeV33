package com.birdeye

import android.content.Context
import androidx.room.withTransaction
import java.io.File

/** detection_log entries captured before this time are pruned: keepDays (log_keep_days) before now. */
fun logPruneCutoffMs(nowMs: Long, keepDays: Double): Long = nowMs - (keepDays * 24 * 60 * 60 * 1000).toLong()

/**
 * Writes records into the Room queue through the duplicate filter, and hands batches to the uploader.
 * Crops are JPEG files in app storage (files/crops); each row stores its path.
 */
class DetectionQueue(context: Context) : QueueStore {
    private val appContext = context.applicationContext
    private val db = QueueDb.get(appContext)
    private val dao = db.dao()
    private val config = Settings.config(appContext)
    val cropDir: File = File(appContext.filesDir, "crops").apply { mkdirs() }

    /**
     * Adds one record with its JPEG crop. Returns the filter's decision. The crop file is written only
     * when the record is kept, and the crops of replaced records are deleted.
     */
    suspend fun add(record: DetectionRecord, capturedAtMs: Long, jpeg: ByteArray): DupDecision {
        val removedCrops = mutableListOf<String>()
        val decision = db.withTransaction {
            val windowMs = (config.duplicateTimeS * 1000).toLong()
            val recent = dao.logSince(capturedAtMs - windowMs).map {
                DupCandidate(
                    clientId = it.clientId,
                    defectType = DefectType.entries.first { t -> t.wire == it.defectType },
                    capturedAtMs = it.capturedAtMs,
                    lat = it.lat,
                    lon = it.lon,
                    confidence = it.confidence,
                    uploaded = it.uploadedAtMs != null,
                )
            }
            val new = DupCandidate(
                record.clientId, record.defectType, capturedAtMs,
                record.defectPoint.lat, record.defectPoint.lon, record.confidence, uploaded = false,
            )
            val decision = DuplicateFilter.decide(new, recent, config.duplicateDistanceM, config.duplicateTimeS)
            if (decision is DupDecision.Replace) {
                removedCrops += dao.detections(decision.clientIds).map { it.cropPath }
                dao.deleteDetections(decision.clientIds)
                dao.deleteLog(decision.clientIds)
            }
            if (decision != DupDecision.Drop) {
                val crop = File(cropDir, record.cropFile)
                crop.writeBytes(jpeg)
                dao.insert(QueuedDetection.from(record, crop.path, capturedAtMs))
                dao.insertLog(
                    DetectionLogEntry(
                        record.clientId, record.defectType.wire, capturedAtMs,
                        record.defectPoint.lat, record.defectPoint.lon, record.confidence, uploadedAtMs = null,
                    ),
                )
            }
            decision
        }
        removedCrops.forEach { File(it).delete() }
        if (decision != DupDecision.Drop) Uploads.uploadNow(appContext)
        return decision
    }

    override suspend fun pendingBatch(limit: Int, capturedBeforeMs: Long) = dao.pendingBatch(limit, capturedBeforeMs)

    override suspend fun hasPending() = dao.pendingNow() > 0

    /** The backend has these: delete the rows and their crops, and count them as uploaded. */
    override suspend fun uploaded(rows: List<QueuedDetection>, atMs: Long) {
        val ids = rows.map { it.clientId }
        db.withTransaction {
            dao.markUploaded(ids, atMs)
            dao.deleteDetections(ids)
        }
        rows.forEach { File(it.cropPath).delete() }
    }

    override suspend fun rejected(rows: List<QueuedDetection>) = dao.markRejected(rows.map { it.clientId })

    override suspend fun failedAttempt(rows: List<QueuedDetection>) = dao.addAttempt(rows.map { it.clientId })

    /** Deletes old log entries except those belonging to pending detections. Run once at shift start. */
    suspend fun pruneLog(beforeMs: Long) = dao.deleteLogBefore(beforeMs)

    fun rejectedCount() = dao.rejectedCount()

    fun pendingCount() = dao.pendingCount()

    fun foundSince(sinceMs: Long) = dao.foundSince(sinceMs)

    fun uploadedSince(sinceMs: Long) = dao.uploadedSince(sinceMs)
}
