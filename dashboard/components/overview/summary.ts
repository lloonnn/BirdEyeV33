import type { DefectStatus } from "@/lib/api-types"

// The three stages the Overview can show, one at a time. Fixed, confirmed and
// rejected never appear: nothing is left to do for them. In order of the
// workflow: check it, wait for a job, be in a job.
export type Stage = Extract<DefectStatus, "detected" | "verified" | "scheduled">

export const stages: Stage[] = ["detected", "verified", "scheduled"]

export const defaultStage: Stage = "detected"

export function isStage(status: DefectStatus): status is Stage {
  return (stages as DefectStatus[]).includes(status)
}

// A response that hit the limit may have more behind it, so it shows "500+".
export function countText(count: number, limit: number): string {
  return count >= limit ? `${limit}+` : String(count)
}
