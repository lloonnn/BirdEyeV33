// INVENTED DATA for development. Not from a real device, road or backend.
package com.birdeye

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.location.Location
import androidx.core.graphics.createBitmap
import java.io.ByteArrayOutputStream
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Debug builds only: makes an invented pothole record near the current position, with a grey
 * placeholder crop marked MOCK. Every fake record is a pothole 10 m ahead of the vehicle, so taps
 * within duplicate_time_s at the same spot are duplicates and taps further apart are not.
 * Confidence rises by 0.01 with each tap (0.80 to 0.98, then round again), so a quick second tap
 * is always the better duplicate. Reason: the duplicate test needs a known order.
 */
object FakeDetection {
    private const val AHEAD_M = 10.0 // invented
    private const val MODEL_VERSION = "mock-fake-detection"
    private var taps = 0

    fun make(fix: Location, deviceId: String): Pair<DetectionRecord, ByteArray> {
        val clientId = UUID.randomUUID().toString()
        val heading = if (fix.hasBearing()) fix.bearing.toDouble() else 0.0
        val record = DetectionRecord(
            clientId = clientId,
            deviceId = deviceId,
            capturedAt = OffsetDateTime.now().truncatedTo(ChronoUnit.SECONDS).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            defectType = DefectType.Pothole,
            confidence = 0.80 + (taps++ % 19) * 0.01, // save band
            band = Band.Save,
            bbox = listOf(0.42f, 0.62f, 0.54f, 0.71f), // normalised, invented
            vehicle = Vehicle(
                lat = fix.latitude,
                lon = fix.longitude,
                gpsAccuracyM = fix.accuracy.toDouble(),
                headingDeg = heading,
                speedKmh = if (fix.hasSpeed()) fix.speed * 3.6 else 0.0,
            ),
            distanceAheadM = AHEAD_M,
            defectPoint = offsetPoint(fix.latitude, fix.longitude, heading, AHEAD_M),
            modelVersion = MODEL_VERSION,
            urgent = false,
            cropFile = "$clientId.jpg",
        )
        return record to mockCrop()
    }

    private fun mockCrop(): ByteArray {
        val bitmap = createBitmap(320, 240)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.DKGRAY)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.YELLOW
            textSize = 72f
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText("MOCK", 160f, 145f, paint)
        return ByteArrayOutputStream().use {
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it)
            bitmap.recycle()
            it.toByteArray()
        }
    }
}
