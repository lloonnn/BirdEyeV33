import { useSyncExternalStore } from "react"

// Counts for the badges in the pill menu: pending reviews and work orders
// waiting for approval. Each page sets its count after every load; the menu
// loads any count still unknown once. Client only.

export type NavCounts = { review: number | null; workOrders: number | null }

let counts: NavCounts = { review: null, workOrders: null }
const listeners = new Set<() => void>()

export function setNavCount(key: keyof NavCounts, value: number) {
  counts = { ...counts, [key]: value }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const serverCounts: NavCounts = { review: null, workOrders: null }

export function useNavCounts(): NavCounts {
  return useSyncExternalStore(
    subscribe,
    () => counts,
    () => serverCounts
  )
}
