// Invented data for the prototype.
// One in-memory store for every mock function, so a mock action on one page
// shows on every other page (Rule 4). It resets on a full page reload.

import type { Defect, Review, WorkOrder } from "@/lib/api-types"
import { seedDefects } from "@/lib/mocks/defects"
import { seedReviews } from "@/lib/mocks/reviews"
import { seedWorkOrders } from "@/lib/mocks/work-orders"

export type MockFailure = { status: number; detail: string }

const now = Date.now()

export const store: {
  defects: Defect[]
  workOrders: WorkOrder[]
  reviews: Review[]
  // Crops kept as negative training examples: review `not_defect` answers
  // (by client_id) and rejected defects (by crop_url).
  negativeExamples: string[]
  // Testing aid: the next mock action fails with this, then it clears.
  failNext: MockFailure | null
} = {
  defects: seedDefects(now),
  workOrders: seedWorkOrders(now),
  reviews: seedReviews(now),
  negativeExamples: [],
  failNext: null,
}

declare global {
  interface Window {
    birdEyeMock?: typeof store
  }
}

// Mock mode only: open the browser console to test error states, for example
// `birdEyeMock.failNext = { status: 422, detail: "Invalid ID" }`, or change a
// defect's status behind the panel to get a real 409.
if (typeof window !== "undefined") window.birdEyeMock = store
