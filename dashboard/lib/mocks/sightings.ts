// Invented data for the prototype.
// Sightings for a mock defect: exactly `sighting_count` of them, spread from
// first seen to last seen, so the panel's history matches the defect.

import type { Defect, Sighting } from "@/lib/api-types"

const DEVICES = ["car-01", "car-02", "car-03", "van-04", "car-05", "van-06"]

// ISO 8601 with the +08:00 offset, as the contract's examples use.
function malaysiaIso(ms: number): string {
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+08:00")
}

export function mockSightings(defect: Defect): Sighting[] {
  const first = Date.parse(defect.first_seen)
  const last = Date.parse(defect.last_seen)
  const count = defect.sighting_count
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? last : first + ((last - first) * i) / (count - 1)
    return {
      id: defect.id * 100 + i + 1,
      captured_at: malaysiaIso(t),
      // Repeatable, not random: varies by defect and sighting.
      confidence: Math.round((0.6 + ((defect.id * 7 + i * 13) % 35) / 100) * 100) / 100,
      crop_url: `/crops/mock-${defect.id}-${i + 1}.jpg`,
      device_id: DEVICES[(defect.id + i * 2) % DEVICES.length],
    }
  })
}
