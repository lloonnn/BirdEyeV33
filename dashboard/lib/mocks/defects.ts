// Invented data for the prototype.
// Not real detections, roads or devices. Positions are made-up points in one
// precinct of City of Elmina (latitude 3.17 to 3.20, longitude 101.50 to
// 101.53), not copied from OpenStreetMap or any other source.

import type { Defect, DefectStatus, DefectType, LocationReason, UrgencyBand } from "@/lib/api-types"
import { malaysiaIso } from "@/lib/mocks/iso"

// Mock only. The real cut-offs are a backend setting not chosen yet
// (decision 65); the dashboard never computes bands, it reads `urgency_band`.
const MOCK_HIGH_FROM = 0.65
const MOCK_MEDIUM_FROM = 0.42

// Mock only. A pothole scores higher than a crack in the type term (decision 44).
export const TYPE_TERM: Record<DefectType, number> = { pothole: 1, crack: 0.4 }

type Row = [
  id: number,
  type: DefectType,
  status: DefectStatus,
  lat: number,
  lon: number,
  size: number,
  location: number,
  age: number,
  sightings: number,
  firstSeenDaysAgo: number,
  lastSeenHoursAgo: number,
  segmentId: number,
  workOrderId: number | null,
]

// Mostly cracks, mostly low and medium urgency: new township roads, damage
// caught early (brief section 6).
const rows: Row[] = [
  // Detected
  [101, "crack", "detected", 3.1862, 101.5121, 0.2, 0.3, 0.1, 1, 1, 3, 1012, null],
  [102, "crack", "detected", 3.1795, 101.5074, 0.3, 0.2, 0.1, 2, 2, 5, 1031, null],
  [103, "crack", "detected", 3.1921, 101.5203, 0.4, 0.6, 0.1, 1, 1, 2, 1105, null],
  [104, "pothole", "detected", 3.1748, 101.5162, 0.3, 0.2, 0.1, 2, 1, 6, 1044, null],
  [105, "crack", "detected", 3.1836, 101.5251, 0.2, 0.1, 0.2, 1, 3, 20, 1120, null],
  [106, "crack", "detected", 3.1967, 101.5048, 0.5, 0.4, 0.1, 2, 1, 1, 1150, null],
  [107, "crack", "detected", 3.1724, 101.5039, 0.1, 0.2, 0.1, 1, 0, 1, 1002, null],
  [108, "pothole", "detected", 3.1889, 101.5097, 0.5, 0.6, 0.2, 2, 2, 4, 1066, null],
  [109, "crack", "detected", 3.1811, 101.5188, 0.3, 0.8, 0.1, 1, 1, 7, 1081, null],
  [110, "crack", "detected", 3.1943, 101.5262, 0.2, 0.2, 0.2, 2, 2, 9, 1133, null],
  [111, "crack", "detected", 3.1771, 101.5225, 0.4, 0.3, 0.1, 1, 0, 2, 1049, null],
  [112, "crack", "detected", 3.1902, 101.5146, 0.3, 0.5, 0.1, 2, 1, 3, 1091, null],
  // Verified
  // The demo urgency scene: a small pothole by the school gate (high location
  // term) ranks above a larger pothole on a quiet street (113 above 114).
  [113, "pothole", "verified", 3.1878, 101.5168, 0.2, 1.0, 0.4, 5, 6, 2, 1072, null],
  [114, "pothole", "verified", 3.1742, 101.5281, 0.8, 0.1, 0.3, 4, 5, 8, 1047, null],
  [115, "crack", "verified", 3.1829, 101.5112, 0.4, 0.5, 0.4, 3, 7, 4, 1060, null],
  [116, "crack", "verified", 3.1955, 101.5181, 0.5, 0.4, 0.3, 3, 5, 6, 1141, null],
  [117, "pothole", "verified", 3.1803, 101.5136, 0.7, 0.9, 0.6, 6, 9, 1, 1058, null],
  [118, "crack", "verified", 3.1758, 101.5093, 0.3, 0.3, 0.5, 4, 8, 12, 1037, null],
  [119, "crack", "verified", 3.1984, 101.5124, 0.6, 0.5, 0.2, 3, 4, 5, 1158, null],
  [120, "pothole", "verified", 3.1916, 101.5059, 0.6, 0.8, 0.7, 5, 10, 3, 1098, null],
  [121, "crack", "verified", 3.1849, 101.5214, 0.4, 0.2, 0.3, 3, 6, 10, 1085, null],
  [122, "crack", "verified", 3.1781, 101.5257, 0.2, 0.4, 0.6, 4, 11, 7, 1052, null],
  [123, "crack", "verified", 3.1933, 101.5229, 0.5, 0.7, 0.4, 3, 5, 2, 1128, null],
  // Scheduled
  [124, "pothole", "scheduled", 3.1866, 101.5072, 0.6, 0.6, 0.5, 6, 9, 5, 1068, 3],
  [125, "crack", "scheduled", 3.1866, 101.5079, 0.4, 0.6, 0.5, 4, 9, 5, 1068, 3],
  [126, "crack", "scheduled", 3.1797, 101.5196, 0.5, 0.4, 0.6, 5, 12, 8, 1083, 4],
  [127, "pothole", "scheduled", 3.1951, 101.5097, 0.7, 0.5, 0.4, 5, 8, 3, 1145, 5],
  [128, "crack", "scheduled", 3.1954, 101.5103, 0.3, 0.5, 0.4, 3, 8, 3, 1145, 5],
  // Fixed
  [129, "pothole", "fixed", 3.1817, 101.5048, 0.6, 0.7, 0.7, 7, 14, 30, 1035, 2],
  [130, "crack", "fixed", 3.1891, 101.5242, 0.4, 0.3, 0.6, 4, 13, 26, 1112, 2],
  [131, "crack", "fixed", 3.1739, 101.5128, 0.3, 0.4, 0.8, 5, 16, 50, 1041, 1],
  // Confirmed
  [132, "pothole", "confirmed", 3.1873, 101.5219, 0.5, 0.6, 0.8, 8, 25, 70, 1110, 1],
  [133, "crack", "confirmed", 3.1792, 101.5161, 0.3, 0.5, 0.9, 6, 28, 90, 1076, 1],
  [134, "crack", "confirmed", 3.1929, 101.5167, 0.2, 0.3, 0.9, 5, 30, 110, 1126, 1],
  [135, "crack", "confirmed", 3.1764, 101.5212, 0.4, 0.2, 0.8, 4, 24, 75, 1050, 2],
  [136, "pothole", "confirmed", 3.1975, 101.5071, 0.4, 0.4, 1.0, 7, 33, 120, 1153, 2],
  [137, "crack", "confirmed", 3.1838, 101.5034, 0.3, 0.3, 0.9, 5, 27, 96, 1029, 2],
  // Rejected: false detections, such as a shadow or a patch of wet road
  [138, "crack", "rejected", 3.1858, 101.5179, 0.1, 0.4, 0.2, 1, 4, 90, 1074, null],
  [139, "pothole", "rejected", 3.1906, 101.5273, 0.2, 0.2, 0.3, 1, 6, 140, 1136, null],
  [140, "crack", "rejected", 3.1751, 101.5054, 0.1, 0.3, 0.2, 1, 5, 115, 1039, null],
]

const HOUR = 60 * 60 * 1000

// Mock only. Why the location term is high (decision 85). The demo pins name
// their reason; the rest follow the term: 0.8 and up on a main road, 0.6 and
// up at a junction, lower has no reason.
const reasonsById: Record<number, LocationReason[]> = {
  109: ["main_road", "junction"],
  113: ["school"],
  117: ["school", "junction"],
  120: ["main_road"],
}

// Mock only. Sample photos in public/mock-crops/, picked by type and rotated
// by `n` (a defect id, plus the sighting index), so neighbours differ.
const MOCK_CROPS: Record<DefectType, string[]> = {
  pothole: ["pothole-1.jpg", "pothole-2.jpg"],
  crack: ["crack-1.jpg"],
}

export function mockCropUrl(type: DefectType, n: number): string {
  const images = MOCK_CROPS[type]
  return `/mock-crops/${images[n % images.length]}`
}

export function locationReasons(id: number, location: number): LocationReason[] {
  if (reasonsById[id]) return [...reasonsById[id]]
  if (location >= 0.8) return ["main_road"]
  if (location >= 0.6) return ["junction"]
  return []
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function band(urgency: number): UrgencyBand {
  if (urgency >= MOCK_HIGH_FROM) return "high"
  if (urgency >= MOCK_MEDIUM_FROM) return "medium"
  return "low"
}

// Builds the seed defects with times relative to `now`, so "first seen" and
// "last seen" stay sensible whenever the prototype runs. `confirmed_at` is
// filled in by the seed history (lib/mocks/history.ts).
export function seedDefects(now: number): Defect[] {
  return rows.map(
    ([id, type, status, lat, lon, size, location, age, sightings, firstDays, lastHours, segmentId, workOrderId]) => {
      const terms = { type: TYPE_TERM[type], size, location, age }
      // Equal weights (decision 45).
      const urgency = round2((terms.type + size + location + age) / 4)
      return {
        id,
        type,
        status,
        urgency,
        urgency_band: band(urgency),
        urgency_terms: terms,
        lat,
        lon,
        first_seen: malaysiaIso(now - firstDays * 24 * HOUR - 3 * HOUR),
        last_seen: malaysiaIso(now - lastHours * HOUR),
        sighting_count: sightings,
        crop_url: mockCropUrl(type, id),
        segment_id: segmentId,
        work_order_id: workOrderId,
        confirmed_at: null,
        location_reasons: locationReasons(id, location),
      }
    }
  )
}
