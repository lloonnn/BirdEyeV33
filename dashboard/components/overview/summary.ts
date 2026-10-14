import type { Defect } from "@/lib/api-types"
import { fixFirstCount } from "@/lib/config"

// Open means still waiting for a repair: not fixed, confirmed or rejected.
export function isOpen(defect: Defect): boolean {
  return defect.status === "detected" || defect.status === "verified" || defect.status === "scheduled"
}

// The precinct list arrives sorted by `urgency_desc`. v0's `status` takes one
// value and there is no "open" filter, so `limit` cannot cut the list to open
// defects server side; take the first open ones here instead.
export function fixFirst(defects: Defect[]): Defect[] {
  return defects.filter(isOpen).slice(0, fixFirstCount)
}

export type PrecinctStats = { open: number; fixFirst: number; confirmed: number }

export function precinctStats(defects: Defect[]): PrecinctStats {
  const open = defects.filter(isOpen)
  return {
    open: open.length,
    fixFirst: open.filter((d) => d.urgency_band === "high").length,
    confirmed: defects.filter((d) => d.status === "confirmed").length,
  }
}
