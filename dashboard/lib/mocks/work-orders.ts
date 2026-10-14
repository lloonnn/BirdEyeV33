// Invented data for the prototype.
// Work orders that match the `work_order_id` on the seed defects: jobs 1 and 2
// are done (their defects are fixed or confirmed), jobs 3 to 5 are approved
// (their defects are scheduled). Agent drafts arrive with Phase 7.

import type { WorkOrder, WorkOrderStatus } from "@/lib/api-types"
import { malaysiaIso } from "@/lib/mocks/iso"

const DAY = 24 * 60 * 60 * 1000

type Row = [
  id: number,
  status: WorkOrderStatus,
  crewType: string,
  description: string,
  defectIds: number[],
  createdDaysAgo: number,
  approvedDaysAgo: number | null,
]

const rows: Row[] = [
  [1, "done", "patching", "Patch a pothole and seal three cracks along the main loop road.", [131, 132, 133, 134], 30, 29],
  [2, "done", "patching", "Patch two potholes and seal three cracks in the north residential streets.", [129, 130, 135, 136, 137], 34, 33],
  [3, "approved", "patching", "Patch a pothole and seal the crack beside it at the same corner.", [124, 125], 3, 2],
  [4, "approved", "crack sealing", "Seal a crack near the school route.", [126], 4, 3],
  [5, "approved", "patching", "Patch a pothole and seal a crack on the same street.", [127, 128], 2, 1],
]

export function seedWorkOrders(now: number): WorkOrder[] {
  return rows.map(([id, status, crewType, description, defectIds, created, approved]) => ({
    id,
    status,
    crew_type: crewType,
    description,
    defect_ids: defectIds,
    created_at: malaysiaIso(now - created * DAY),
    approved_at: approved === null ? null : malaysiaIso(now - approved * DAY),
  }))
}
