import type { Defect } from "@/lib/api-types"
import { fixFirstCount } from "@/lib/config"

// Statuses the Overview shows. Fixed, confirmed and rejected never appear:
// nothing is left to do for them. Scheduled stays so Mark fixed can reach it.
export function onOverview(defect: Defect): boolean {
  return defect.status === "detected" || defect.status === "verified" || defect.status === "scheduled"
}

// Needs a decision: open and not yet in an approved job.
function isUnscheduled(defect: Defect): boolean {
  return defect.status === "detected" || defect.status === "verified"
}

// The area list arrives sorted by `urgency_desc`. v0's `status` takes one
// value, so `limit` cannot cut the list to detected and verified server side;
// take the first ones here instead.
export function mostUrgent(defects: Defect[]): Defect[] {
  return defects.filter(isUnscheduled).slice(0, fixFirstCount)
}

export type AreaStats = { open: number; fixFirst: number }

// Card 1: open counts detected, verified and scheduled; fix first counts the
// detected and verified ones in the high band, the same set as Most urgent.
export function areaStats(defects: Defect[]): AreaStats {
  return {
    open: defects.filter(onOverview).length,
    fixFirst: defects.filter((d) => isUnscheduled(d) && d.urgency_band === "high").length,
  }
}
