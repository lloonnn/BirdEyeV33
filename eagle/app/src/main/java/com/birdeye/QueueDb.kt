package com.birdeye

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

/** Local queue state. A row leaves the queue (is deleted) once the backend has it. */
enum class QueueState { Pending, Rejected }

/**
 * One detection record waiting to upload: every field of the v0 detection record, flattened, plus
 * local fields. Rows live in SQLite through Room, so a crash, force stop or reboot loses nothing.
 */
@Entity(tableName = "detections")
data class QueuedDetection(
    @PrimaryKey val clientId: String, // client_id
    val deviceId: String, // device_id
    val capturedAt: String, // captured_at
    val defectType: String, // defect_type: "pothole" or "crack"
    val confidence: Double, // confidence
    val band: String, // band: "save" or "review"
    val bboxX1: Float, // bbox[0]
    val bboxY1: Float, // bbox[1]
    val bboxX2: Float, // bbox[2]
    val bboxY2: Float, // bbox[3]
    val vehicleLat: Double, // vehicle.lat
    val vehicleLon: Double, // vehicle.lon
    val vehicleGpsAccuracyM: Double, // vehicle.gps_accuracy_m
    val vehicleHeadingDeg: Double, // vehicle.heading_deg
    val vehicleSpeedKmh: Double, // vehicle.speed_kmh
    val distanceAheadM: Double, // distance_ahead_m
    val defectLat: Double, // defect_point.lat
    val defectLon: Double, // defect_point.lon
    val modelVersion: String, // model_version
    val urgent: Boolean, // urgent
    val cropFile: String, // crop_file
    // Local fields, never sent.
    val queueState: QueueState,
    val attempts: Int,
    val cropPath: String, // JPEG in app storage
    val capturedAtMs: Long, // captured_at as epoch ms, for the duplicate window
) {
    fun toRecord() = DetectionRecord(
        clientId = clientId,
        deviceId = deviceId,
        capturedAt = capturedAt,
        defectType = DefectType.entries.first { it.wire == defectType },
        confidence = confidence,
        band = Band.entries.first { it.wire == band },
        bbox = listOf(bboxX1, bboxY1, bboxX2, bboxY2),
        vehicle = Vehicle(vehicleLat, vehicleLon, vehicleGpsAccuracyM, vehicleHeadingDeg, vehicleSpeedKmh),
        distanceAheadM = distanceAheadM,
        defectPoint = LatLon(defectLat, defectLon),
        modelVersion = modelVersion,
        urgent = urgent,
        cropFile = cropFile,
    )

    companion object {
        fun from(record: DetectionRecord, cropPath: String, capturedAtMs: Long) = QueuedDetection(
            clientId = record.clientId,
            deviceId = record.deviceId,
            capturedAt = record.capturedAt,
            defectType = record.defectType.wire,
            confidence = record.confidence,
            band = record.band.wire,
            bboxX1 = record.bbox[0],
            bboxY1 = record.bbox[1],
            bboxX2 = record.bbox[2],
            bboxY2 = record.bbox[3],
            vehicleLat = record.vehicle.lat,
            vehicleLon = record.vehicle.lon,
            vehicleGpsAccuracyM = record.vehicle.gpsAccuracyM,
            vehicleHeadingDeg = record.vehicle.headingDeg,
            vehicleSpeedKmh = record.vehicle.speedKmh,
            distanceAheadM = record.distanceAheadM,
            defectLat = record.defectPoint.lat,
            defectLon = record.defectPoint.lon,
            modelVersion = record.modelVersion,
            urgent = record.urgent,
            cropFile = record.cropFile,
            queueState = QueueState.Pending,
            attempts = 0,
            cropPath = cropPath,
            capturedAtMs = capturedAtMs,
        )
    }
}

/**
 * A short entry for every record that passed the duplicate filter, kept after the queued row is
 * uploaded and deleted. Reason: the counts (defects today, uploads completed) and the duplicate
 * filter must still see records that already left the phone.
 */
@Entity(tableName = "detection_log")
data class DetectionLogEntry(
    @PrimaryKey val clientId: String,
    val defectType: String,
    val capturedAtMs: Long,
    val lat: Double, // defect_point
    val lon: Double,
    val confidence: Double,
    val uploadedAtMs: Long?, // null until the backend has it
)

@Dao
interface QueueDao {
    @Insert
    suspend fun insert(detection: QueuedDetection)

    @Insert
    suspend fun insertLog(entry: DetectionLogEntry)

    @Query("SELECT * FROM detection_log WHERE capturedAtMs >= :sinceMs")
    suspend fun logSince(sinceMs: Long): List<DetectionLogEntry>

    @Query("SELECT * FROM detections WHERE clientId IN (:ids)")
    suspend fun detections(ids: List<String>): List<QueuedDetection>

    @Query("DELETE FROM detections WHERE clientId IN (:ids)")
    suspend fun deleteDetections(ids: List<String>)

    @Query("DELETE FROM detection_log WHERE clientId IN (:ids)")
    suspend fun deleteLog(ids: List<String>)

    @Query("SELECT * FROM detections WHERE queueState = 'Pending' AND capturedAtMs < :capturedBeforeMs ORDER BY capturedAtMs LIMIT :limit")
    suspend fun pendingBatch(limit: Int, capturedBeforeMs: Long): List<QueuedDetection>

    @Query("SELECT COUNT(*) FROM detections WHERE queueState = 'Pending'")
    suspend fun pendingNow(): Int

    @Query("UPDATE detections SET queueState = 'Rejected' WHERE clientId IN (:ids)")
    suspend fun markRejected(ids: List<String>)

    @Query("UPDATE detections SET attempts = attempts + 1 WHERE clientId IN (:ids)")
    suspend fun addAttempt(ids: List<String>)

    @Query("UPDATE detection_log SET uploadedAtMs = :atMs WHERE clientId IN (:ids)")
    suspend fun markUploaded(ids: List<String>, atMs: Long)

    @Query("DELETE FROM detection_log WHERE capturedAtMs < :beforeMs AND clientId NOT IN (SELECT clientId FROM detections WHERE queueState = 'Pending')")
    suspend fun deleteLogBefore(beforeMs: Long): Int

    @Query("SELECT COUNT(*) FROM detections WHERE queueState = 'Rejected'")
    fun rejectedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM detections WHERE queueState = 'Pending'")
    fun pendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM detection_log WHERE capturedAtMs >= :sinceMs")
    fun foundSince(sinceMs: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM detection_log WHERE uploadedAtMs >= :sinceMs")
    fun uploadedSince(sinceMs: Long): Flow<Int>
}

@Database(entities = [QueuedDetection::class, DetectionLogEntry::class], version = 2, exportSchema = false)
abstract class QueueDb : RoomDatabase() {
    abstract fun dao(): QueueDao

    companion object {
        const val NAME = "queue.db"

        @Volatile private var instance: QueueDb? = null

        fun get(context: Context): QueueDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, QueueDb::class.java, NAME)
                // Version 2 changed bbox from pixels to 0 to 1 floats. The queue held only invented
                // data, so dropping it is safe.
                .fallbackToDestructiveMigrationFrom(true, 1)
                .build()
                .also { instance = it }
        }
    }
}
