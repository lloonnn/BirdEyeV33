// Invented data for the prototype.
// One in-memory store for every mock function, so a mock action on one page
// shows on every other page (Rule 4). In mock mode it is saved to
// localStorage after every mock action and loaded on start, so it survives a
// reload. Real mode never reads or writes that storage.

import type { Brief, Defect, HistoryEntry, Review, WorkOrder } from "@/lib/api-types"
import { seedBrief } from "@/lib/mocks/brief"
import { seedDefects } from "@/lib/mocks/defects"
import { seedHistory } from "@/lib/mocks/history"
import { seedReviews } from "@/lib/mocks/reviews"
import { seedWorkOrders } from "@/lib/mocks/work-orders"

export type MockFailure = { status: number; detail: string }

type Saved = {
  defects: Defect[]
  // Each defect's status history, oldest first, by defect ID (decision 86).
  history: Record<number, HistoryEntry[]>
  workOrders: WorkOrder[]
  reviews: Review[]
  // The latest brief, or null for "none yet" (GET /brief/latest returns 404).
  brief: Brief | null
  // Crops kept as negative training examples: review `not_defect` answers
  // (by client_id) and rejected defects (by crop_url).
  negativeExamples: string[]
}

// Bump the version when the saved shape or seed values change, so old saves
// are ignored. v3: crops point at public/mock-crops/.
const STORAGE_KEY = "bird-eye-mock-v3"
const canPersist = process.env.NEXT_PUBLIC_API_MODE !== "real" && typeof window !== "undefined"

function seed(): Saved {
  const now = Date.now()
  const defects = seedDefects(now)
  const workOrders = seedWorkOrders(now)
  return {
    defects,
    history: seedHistory(defects, workOrders, now),
    workOrders,
    reviews: seedReviews(now),
    brief: seedBrief(now),
    negativeExamples: [],
  }
}

// The saved state, or null when there is none, storage fails, or it does not
// look like a save from this version.
function load(): Saved | null {
  if (!canPersist) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<Saved>
    const ok =
      Array.isArray(saved.defects) &&
      typeof saved.history === "object" &&
      saved.history !== null &&
      Array.isArray(saved.workOrders) &&
      Array.isArray(saved.reviews) &&
      Array.isArray(saved.negativeExamples) &&
      saved.brief !== undefined
    return ok ? (saved as Saved) : null
  } catch {
    return null
  }
}

export const store: Saved & {
  // Testing aid: the next mock action fails with this, then it clears. Not saved.
  failNext: MockFailure | null
} = { ...(load() ?? seed()), failNext: null }

// Saves the store after a mock action. A storage failure is ignored: the
// prototype still works, it just starts from the seed on the next load.
export function persist() {
  if (!canPersist) return
  try {
    const { failNext: _skip, ...saved } = store
    void _skip
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  } catch {
    // Storage full, blocked or private mode: keep going in memory.
  }
}

// Forgets the saved state; the next load starts from the seed data.
export function clearSaved() {
  if (!canPersist) return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing saved could be removed; the seed still loads if reading fails.
  }
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
