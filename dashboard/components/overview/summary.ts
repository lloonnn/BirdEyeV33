import type { Defect, DefectStatus } from "@/lib/api-types"

// Statuses the Overview shows, asked of the server with `status=`. Fixed,
// confirmed and rejected never appear: nothing is left to do for them.
// Scheduled stays so Mark fixed can reach it.
export const overviewStatuses: DefectStatus[] = ["detected", "verified", "scheduled"]

// Needs a decision: open and not yet in an approved job.
export const unscheduledStatuses: DefectStatus[] = ["detected", "verified"]

export type AreaStats = { open: number; fixFirst: number }

// Card 1: open counts detected, verified and scheduled; fix first counts the
// detected and verified ones in the high band, the same set as Most urgent.
export function areaStats(open: Defect[], unscheduled: Defect[]): AreaStats {
  return {
    open: open.length,
    fixFirst: unscheduled.filter((d) => d.urgency_band === "high").length,
  }
}
