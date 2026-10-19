package com.birdeye

import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tan

/**
 * Distance ahead of the camera to the bottom edge of a box on a flat road (architecture.md, Distance
 * ahead): d = h / tan(alpha + beta). alpha is the camera tilt below the horizon, beta the angle of the
 * box's bottom edge below the image centre, from the vertical field of view. [bottomNorm] is the box's
 * bottom edge as a fraction of the frame height, 0 at the top. Returns null when the ray does not reach
 * the road in front (alpha + beta is at or above the horizon).
 */
fun distanceAheadM(heightM: Double, tiltDownDeg: Double, vFovDeg: Double, bottomNorm: Double): Double? {
    val halfTan = tan(Math.toRadians(vFovDeg) / 2)
    val beta = atan((2 * bottomNorm - 1) * halfTan)
    val angle = Math.toRadians(tiltDownDeg) + beta
    if (angle <= Math.toRadians(0.5)) return null
    return heightM / tan(angle)
}

/** The vehicle position moved d metres along the heading (architecture.md, Distance ahead). */
fun offsetPoint(lat: Double, lon: Double, headingDeg: Double, d: Double): LatLon {
    val theta = Math.toRadians(headingDeg)
    return LatLon(
        lat = lat + d * cos(theta) / 111_320.0,
        lon = lon + d * sin(theta) / (111_320.0 * cos(Math.toRadians(lat))),
    )
}
