// Invented data for the prototype.
// Status history for the mock defects (decision 86), and the one helper every
// mock action uses to change a defect's status, so the history, `confirmed_at`
// and `work_order_id` always agree with the status.

import type { Defect, DefectStatus, HistoryEntry, WorkOrder } from "@/lib/api-types"
import { malaysiaIso } from "@/lib/mocks/iso"

const HOUR = 60 * 60 * 1000

// Mock only: when the done jobs finished and when their repairs were
// confirmed, in hours before now. Each is after the last sighting of every
// defect in the job, so no sighting falls after its repair.
const doneHoursAgo: Record<number, number> = { 1: 48, 2: 24 }
const confirmedHoursAgo: Record<number, number> = { 1: 30, 2: 8 }

// A seed defect's path through the lifecycle, with times that keep the order:
// detected at first seen, verified or rejected 12 h later, scheduled when its
// job was approved, fixed when the job was done, then confirmed.
function seedEntries(d: Defect, orders: Map<number, WorkOrder>, now: number): HistoryEntry[] {
  const first = Date.parse(d.first_seen)
  const entries: HistoryEntry[] = [{ status: "detected", at: d.first_seen }]
  if (d.status === "detected") return entries
  if (d.status === "rejected") return [...entries, { status: "rejected", at: malaysiaIso(first + 12 * HOUR) }]

  entries.push({ status: "verified", at: malaysiaIso(first + 12 * HOUR) })
  const order = d.work_order_id === null ? undefined : orders.get(d.work_order_id)
  if (!order?.approved_at) return entries

  entries.push({ status: "scheduled", at: order.approved_at })
  if (d.status === "scheduled") return entries
  entries.push({ status: "fixed", at: malaysiaIso(now - (doneHoursAgo[order.id] ?? 1) * HOUR) })
  if (d.status === "fixed") return entries
  entries.push({ status: "confirmed", at: malaysiaIso(now - (confirmedHoursAgo[order.id] ?? 0.5) * HOUR) })
  return entries
}

// History for every seed defect, keyed by defect ID. Also sets each confirmed
// defect's `confirmed_at` to match its last entry.
export function seedHistory(defects: Defect[], workOrders: WorkOrder[], now: number): Record<number, HistoryEntry[]> {
  const orders = new Map(workOrders.map((w) => [w.id, w]))
  const history: Record<number, HistoryEntry[]> = {}
  for (const d of defects) {
    history[d.id] = seedEntries(d, orders, now)
    if (d.status === "confirmed") d.confirmed_at = history[d.id].at(-1)!.at
  }
  return history
}

// Moves a defect to `status` now and records it. `confirmed_at` follows the
// status. A defect leaves its job when it goes back to detected (a reopened
// repair), so `work_order_id` is non-null only while a job covers it
// (decision 84); approval sets it, outside this helper.
export function setStatus(history: Record<number, HistoryEntry[]>, defect: Defect, status: DefectStatus, at = Date.now()) {
  const when = malaysiaIso(at)
  defect.status = status
  defect.confirmed_at = status === "confirmed" ? when : null
  if (status === "detected") defect.work_order_id = null
  ;(history[defect.id] ??= []).push({ status, at: when })
}
