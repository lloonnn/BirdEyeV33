// Invented data for the prototype.
// The morning brief the agent would post at 07:00 Malaysia time (decision 53).
// One text with a line per point; `defect_ids` lists every defect it cites.

import type { Brief } from "@/lib/api-types"
import { malaysiaIso } from "@/lib/mocks/iso"

const HOUR = 60 * 60 * 1000

// Today's 07:00 in Malaysia time, or yesterday's if it is not 07:00 yet.
function lastSevenAm(now: number): number {
  const myt = new Date(now + 8 * HOUR)
  const seven = Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate(), 7, 0, 4) - 8 * HOUR
  return seven <= now ? seven : seven - 24 * HOUR
}

export function seedBrief(now: number): Brief {
  return {
    id: 9,
    created_at: malaysiaIso(lastSevenAm(now)),
    text: [
      "3 potholes rank fix first; all 3 are verified and waiting for a work order.",
      "2 work orders drafted overnight wait for approval.",
      "Job 3 is approved; its crew can patch 2 defects at one corner.",
      "1 repair was confirmed by clean passes this week.",
    ].join("\n"),
    defect_ids: [117, 120, 113, 124, 125, 133],
  }
}
