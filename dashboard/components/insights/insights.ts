import type { Defect, DefectStatus, DefectsQuery, UrgencyBand } from "@/lib/api-types"
import { regionBounds } from "@/lib/config"

// One call for everything the Insights page counts. The page computes all of
// its numbers from this list; there is no summary endpoint.
export const insightsQuery: DefectsQuery = {
  bbox: regionBounds,
  status: ["detected", "verified", "scheduled", "fixed", "confirmed", "rejected"],
  limit: 500,
}

// Defects the supervisor rejected were never real, so no count includes them.
export function realDefects(defects: Defect[]): Defect[] {
  return defects.filter((d) => d.status !== "rejected")
}

// The five bars, in lifecycle order.
export const stageOrder: DefectStatus[] = ["detected", "verified", "scheduled", "fixed", "confirmed"]

export const bandOrder: UrgencyBand[] = ["high", "medium", "low"]

export function countBy<T extends string>(defects: Defect[], pick: (d: Defect) => T): Map<T, number> {
  const counts = new Map<T, number>()
  for (const d of defects) counts.set(pick(d), (counts.get(pick(d)) ?? 0) + 1)
  return counts
}

// Malaysia has no daylight saving, so a fixed +08:00 offset gives its calendar day.
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" })

// "2026-10-22" for an instant, in Malaysia time.
export function dayKey(date: Date): string {
  return dayKeyFormat.format(date)
}

export type DayCount = { key: string; count: number }

// New defects per Malaysia day for the `days` days ending today, oldest first.
// Days with none are zero. A defect counts on the day of its first_seen.
export function newPerDay(defects: Defect[], now: Date, days: number): DayCount[] {
  const counts = new Map<string, number>()
  for (const d of defects) {
    const key = dayKey(new Date(d.first_seen))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const today = Date.parse(`${dayKey(now)}T00:00:00Z`)
  return Array.from({ length: days }, (_, i) => {
    const key = new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10)
    return { key, count: counts.get(key) ?? 0 }
  })
}

export type StageRow = { status: DefectStatus; total: number } & Record<UrgencyBand, number>

// Each stage's defects split by urgency band, in lifecycle order.
export function stageRows(defects: Defect[]): StageRow[] {
  return stageOrder.map((status) => {
    const row: StageRow = { status, total: 0, high: 0, medium: 0, low: 0 }
    for (const d of defects) {
      if (d.status !== status) continue
      row[d.urgency_band] += 1
      row.total += 1
    }
    return row
  })
}

// New defects in the last 7 days of a 14-day series, and in the 7 before.
export function weekTotals(perDay: DayCount[]): { thisWeek: number; lastWeek: number } {
  const sum = (rows: DayCount[]) => rows.reduce((n, r) => n + r.count, 0)
  return { thisWeek: sum(perDay.slice(-7)), lastWeek: sum(perDay.slice(-14, -7)) }
}
