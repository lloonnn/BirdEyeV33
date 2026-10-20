// Invented data for the prototype.
// Unsure detections waiting for a supervisor: review-band records (confidence
// 0.3 to 0.8), both types, at made-up points in the pilot area. A few sit
// next to seed defects, so a "Yes, defect" answer merges into one of them.

import type { DefectType, Review } from "@/lib/api-types"
import { mockCropUrl } from "@/lib/mocks/defects"
import { malaysiaIso } from "@/lib/mocks/iso"

const HOUR = 60 * 60 * 1000
const DEVICES = ["car-01", "car-02", "car-03", "van-04", "car-05", "van-06"]

type Row = [id: number, type: DefectType, confidence: number, lat: number, lon: number, hoursAgo: number]

const rows: Row[] = [
  [201, "crack", 0.54, 3.18622, 101.51214, 2], // beside crack 101
  [202, "pothole", 0.71, 3.18891, 101.50972, 3], // beside pothole 108
  [203, "crack", 0.38, 3.1772, 101.5168, 5],
  [204, "pothole", 0.46, 3.1934, 101.5112, 7],
  [205, "crack", 0.62, 3.1801, 101.5089, 9],
  [206, "crack", 0.31, 3.1963, 101.5241, 12],
  [207, "pothole", 0.77, 3.1748, 101.5094, 16],
  [208, "crack", 0.49, 3.1857, 101.5266, 20],
  [209, "pothole", 0.58, 3.1912, 101.5197, 26],
  [210, "crack", 0.42, 3.1826, 101.5031, 30],
]

export function seedReviews(now: number): Review[] {
  return rows.map(([id, type, confidence, lat, lon, hoursAgo], i) => {
    const clientId = `mock-review-${id}`
    return {
      id,
      status: "pending",
      sighting: {
        client_id: clientId,
        device_id: DEVICES[i % DEVICES.length],
        captured_at: malaysiaIso(now - hoursAgo * HOUR),
        defect_type: type,
        confidence,
        band: "review",
        bbox: [400, 560, 500, 640],
        // The vehicle was about 14 m behind the defect point.
        vehicle: { lat: lat - 0.00013, lon, gps_accuracy_m: 4, heading_deg: 0, speed_kmh: 30 },
        distance_ahead_m: 14,
        defect_point: { lat, lon },
        model_version: "m-2026-10-01",
        urgent: false,
        crop_file: `${clientId}.jpg`,
        crop_url: mockCropUrl(type, id),
      },
    }
  })
}
