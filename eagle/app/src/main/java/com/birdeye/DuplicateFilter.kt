package com.birdeye

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** What the duplicate filter needs to know about one record. */
data class DupCandidate(
    val clientId: String,
    val defectType: DefectType,
    val capturedAtMs: Long,
    val lat: Double, // defect_point
    val lon: Double,
    val confidence: Double,
    /** True once the record has left the phone; it can no longer be replaced. */
    val uploaded: Boolean,
    /** Save and review records are filtered separately: a review record never replaces or drops a save one. */
    val band: Band = Band.Save,
)

sealed interface DupDecision {
    /** No duplicate nearby: keep the new record. */
    data object Keep : DupDecision

    /** A duplicate with equal or higher confidence exists, or one was already uploaded: drop the new record. */
    data object Drop : DupDecision

    /** The new record beats every duplicate still on the phone: delete these and keep the new one. */
    data class Replace(val clientIds: List<String>) : DupDecision
}

/**
 * Duplicate filter (architecture section 3, step 7): the same defect_type within duplicate_distance_m
 * and duplicate_time_s keeps only the highest confidence record, so one pothole becomes one record per
 * pass. Distance is between defect points. A duplicate that was already uploaded cannot be taken back,
 * so a later one is dropped rather than sent as a second record.
 */
object DuplicateFilter {
    fun decide(new: DupCandidate, recent: List<DupCandidate>, distanceM: Double, timeS: Double): DupDecision {
        val matches = recent.filter {
            it.clientId != new.clientId &&
                it.band == new.band &&
                it.defectType == new.defectType &&
                kotlin.math.abs(it.capturedAtMs - new.capturedAtMs) <= timeS * 1000 &&
                distanceMetres(it.lat, it.lon, new.lat, new.lon) <= distanceM
        }
        if (matches.isEmpty()) return DupDecision.Keep
        if (matches.any { it.uploaded || it.confidence >= new.confidence }) return DupDecision.Drop
        return DupDecision.Replace(matches.map { it.clientId })
    }

    /** Great-circle distance in metres (haversine). Accurate to well under a metre at these ranges. */
    fun distanceMetres(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        return 2 * r * asin(sqrt(a))
    }
}
