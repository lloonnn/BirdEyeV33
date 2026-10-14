import { useSyncExternalStore } from "react"

// When data last loaded from the API (or its mock). The pill menu shows it,
// and the error message names it. Client only.

let lastUpdated: Date | null = null
const listeners = new Set<() => void>()

export function setLastUpdated(date: Date) {
  lastUpdated = date
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLastUpdated(): Date | null {
  return useSyncExternalStore(
    subscribe,
    () => lastUpdated,
    () => null
  )
}
