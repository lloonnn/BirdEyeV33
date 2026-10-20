// Invented data for the prototype.
// Work orders that match the `work_order_id` on the seed defects: jobs 1 and 2
// are done (their defects are fixed or confirmed), jobs 3 to 5 are approved
// (their defects are scheduled). Jobs 6 and 7 are agent drafts waiting for
// approval and cite verified defects; job 8 is a draft a supervisor rejected.
// Draft-cited defects keep `work_order_id` null until approval (decision 84).
// Jobs 1 and 2 were approved after every defect in them was first seen, so
// the defects' status history stays in order.

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
  [1, "done", "patching", "Patch a pothole and seal three cracks along the main loop road.", [131, 132, 133, 134], 15, 14.5],
  [2, "done", "patching", "Patch two potholes and seal three cracks in the north residential streets.", [129, 130, 135, 136, 137], 12.5, 12],
  [3, "approved", "patching", "Patch a pothole and seal the crack beside it at the same corner.", [124, 125], 3, 2],
  [4, "approved", "crack sealing", "Seal a crack near the school route.", [126], 4, 3],
  [5, "approved", "patching", "Patch a pothole and seal a crack on the same street.", [127, 128], 2, 1],
  [6, "pending_approval", "patching", "Patch two large potholes near the school gate. Both were verified this week and rank fix first.", [117, 113], 0.2, null],
  [7, "pending_approval", "patching", "Patch a pothole on the main road, seen five times by patrol phones.", [120], 0.1, null],
  [8, "rejected", "crack sealing", "Seal a short crack beside a quiet street.", [116], 1.5, null],
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
