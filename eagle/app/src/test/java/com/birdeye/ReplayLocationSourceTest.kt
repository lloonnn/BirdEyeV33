package com.birdeye

import org.junit.Assert.assertEquals
import org.junit.Test

class ReplayLocationSourceTest {
    // Invented test track: 10 s, heading 90 to 110, speed 20 to 40 km/h.
    private val source = ReplayLocationSource(
        ReplayTrack(
            listOf(
                TrackSample(0, 3.0, 101.0, 90.0, 20.0, 4.0),
                TrackSample(10_000, 3.1, 101.2, 110.0, 40.0, 8.0),
            ),
        ),
        intervalMs = 1000,
        videoTimeMs = { 0L },
    )

    @Test fun atStart() {
        val s = source.sampleAt(0)
        assertEquals(3.0, s.lat, 1e-9)
        assertEquals(101.0, s.lon, 1e-9)
        assertEquals(90.0, s.headingDeg, 1e-9)
    }

    @Test fun inTheMiddle() {
        val s = source.sampleAt(5_000)
        assertEquals(3.05, s.lat, 1e-9)
        assertEquals(101.1, s.lon, 1e-9)
        assertEquals(100.0, s.headingDeg, 1e-9)
        assertEquals(30.0, s.speedKmh, 1e-9)
        assertEquals(6.0, s.accuracyM, 1e-9)
    }

    @Test fun pastTheEndHoldsTheLastPoint() {
        val s = source.sampleAt(60_000)
        assertEquals(3.1, s.lat, 1e-9)
        assertEquals(101.2, s.lon, 1e-9)
        assertEquals(110.0, s.headingDeg, 1e-9)
        assertEquals(40.0, s.speedKmh, 1e-9)
    }

    @Test fun headingTurnsTheShortWay() {
        val track = ReplayTrack(listOf(TrackSample(0, 0.0, 0.0, 350.0, 0.0, 1.0), TrackSample(10_000, 0.0, 0.0, 10.0, 0.0, 1.0)))
        assertEquals(0.0, track.at(5_000).headingDeg, 1e-9)
    }

    @Test fun parsesTheFileFormat() {
        val track = ReplayTrack.parse("""[{"t_ms":0,"lat":1.0,"lon":2.0,"heading_deg":3.0,"speed_kmh":4.0,"accuracy_m":5.0}]""")
        assertEquals(2.0, track.at(100).lon, 1e-9)
    }
}
