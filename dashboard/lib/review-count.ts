import { useSyncExternalStore } from "react"

// Pending reviews, for the badge on Review in the pill menu. The Review page
// sets it after every load; the menu loads it once if nothing has yet.
// Client only.

let count: number | null = null
const listeners = new Set<() => void>()

export function setReviewCount(next: number) {
  count = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useReviewCount(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => count,
    () => null
  )
}
