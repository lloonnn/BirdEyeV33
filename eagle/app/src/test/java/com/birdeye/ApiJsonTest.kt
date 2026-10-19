package com.birdeye

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ApiJsonTest {
    // The example record from docs/api-contract.md, v0.
    private val contractExample = """
        {
          "client_id": "3f6c9e2a-uuid-made-on-phone",
          "device_id": "car-03",
          "captured_at": "2026-10-12T08:14:22+08:00",
          "defect_type": "pothole",
          "confidence": 0.91,
          "band": "save",
          "bbox": [412, 588, 506, 640],
          "vehicle": { "lat": 3.1834, "lon": 101.5139, "gps_accuracy_m": 4.2, "heading_deg": 87, "speed_kmh": 36 },
          "distance_ahead_m": 14.5,
          "defect_point": { "lat": 3.1834, "lon": 101.5142 },
          "model_version": "m-2026-10-01",
          "urgent": false,
          "crop_file": "3f6c9e2a.jpg"
        }
    """.trimIndent()

    private val record = DetectionRecord(
        clientId = "3f6c9e2a-uuid-made-on-phone", deviceId = "car-03", capturedAt = "2026-10-12T08:14:22+08:00",
        defectType = DefectType.Pothole, confidence = 0.91, band = Band.Save, bbox = listOf(0.4f, 0.6f, 0.5f, 0.7f),
        vehicle = Vehicle(3.1834, 101.5139, 4.2, 87.0, 36.0), distanceAheadM = 14.5, defectPoint = LatLon(3.1834, 101.5142),
        modelVersion = "m-2026-10-01", urgent = false, cropFile = "3f6c9e2a.jpg",
    )

    @Test fun recordKeysMatchContractExample() {
        val expected = Json.parseToJsonElement(contractExample).jsonObject
        val actual = record.toJson()
        assertEquals(expected.keys, actual.keys)
        assertEquals(expected.getValue("vehicle").jsonObject.keys, actual.getValue("vehicle").jsonObject.keys)
        assertEquals(expected.getValue("defect_point").jsonObject.keys, actual.getValue("defect_point").jsonObject.keys)
        assertEquals(4, (actual.getValue("bbox") as kotlinx.serialization.json.JsonArray).size)
    }
}
