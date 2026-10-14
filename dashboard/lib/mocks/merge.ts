// Invented data for the prototype.
// Mock version of the backend merge (architecture.md section 5), used when a
// review answer merges a sighting "as if it were a save-band record"
// (decision 69): attach it to an open defect of the same type within about
// 8 m, or create a new defect in Detected.

import type { Defect, DefectType, DetectionRecord } from "@/lib/api-types"
import { band, TYPE_TERM } from "@/lib/mocks/defects"
import { store } from "@/lib/mocks/store"

// Mock only; the real radius is a backend setting (starting value, to be tuned).
const MERGE_RADIUS_M = 8
const M_PER_DEG_LAT = 111_320

function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT
  const dx = (a.lon - b.lon) * M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

// Returns the defect the sighting joined or created.
export function mergeSighting(record: DetectionRecord & { crop_url: string }, type: DefectType): Defect {
  const point = record.defect_point
  // Rejected defects never take new sightings.
  const match = store.defects
    .filter((d) => d.type === type && d.status !== "rejected")
    .map((d) => ({ d, m: metresBetween(d, point) }))
    .filter(({ m }) => m <= MERGE_RADIUS_M)
    .sort((a, b) => a.m - b.m)[0]?.d

  if (match) {
    const n = match.sighting_count
    // Position becomes the average of the sightings.
    match.lat = Math.round(((match.lat * n + point.lat) / (n + 1)) * 1e6) / 1e6
    match.lon = Math.round(((match.lon * n + point.lon) / (n + 1)) * 1e6) / 1e6
    match.sighting_count = n + 1
    if (Date.parse(record.captured_at) > Date.parse(match.last_seen)) match.last_seen = record.captured_at
    // A matching detection reopens a fixed or confirmed defect, history kept.
    if (match.status === "fixed" || match.status === "confirmed") match.status = "detected"
    return match
  }

  const terms = { type: TYPE_TERM[type], size: 0.3, location: 0.3, age: 0 }
  const urgency = Math.round(((terms.type + terms.size + terms.location + terms.age) / 4) * 100) / 100
  const created: Defect = {
    id: Math.max(...store.defects.map((d) => d.id)) + 1,
    type,
    status: "detected",
    urgency,
    urgency_band: band(urgency),
    urgency_terms: terms,
    lat: point.lat,
    lon: point.lon,
    first_seen: record.captured_at,
    last_seen: record.captured_at,
    sighting_count: 1,
    crop_url: record.crop_url,
    segment_id: 1999,
    work_order_id: null,
  }
  store.defects.push(created)
  return created
}
