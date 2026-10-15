import { useSyncExternalStore } from "react"

// The action lock: viewing needs no code; the first action in a session asks
// for the action code, checked on the server by app/api/unlock. Only an
// "unlocked" flag is kept, in sessionStorage, never the code. A speed bump,
// not security: see dashboard/CLAUDE.md. Client only.

const STORAGE_KEY = "bird-eye-unlocked"

type State = {
  unlocked: boolean
  // True while the "Enter the action code" dialog is open.
  asking: boolean
}

function readUnlocked(): boolean {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

let state: State = { unlocked: readUnlocked(), asking: false }
let waiting: ((unlocked: boolean) => void)[] = []
const listeners = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const serverState: State = { unlocked: false, asking: false }

export function useActionLock(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState
  )
}

// Resolves true once actions are unlocked (at once if they already are), or
// false if the person cancels or actions are off on this deployment.
export function requestUnlock(): Promise<boolean> {
  if (state.unlocked) return Promise.resolve(true)
  return new Promise((resolve) => {
    waiting.push(resolve)
    set({ asking: true })
  })
}

// Runs an action only once actions are unlocked.
export async function guarded(action: () => void) {
  if (await requestUnlock()) action()
}

function finish(unlocked: boolean) {
  const resolvers = waiting
  waiting = []
  set({ asking: false, unlocked: unlocked || state.unlocked })
  resolvers.forEach((resolve) => resolve(unlocked))
}

export type UnlockResult = "ok" | "wrong" | "off" | "error"

async function post(body: unknown): Promise<{ enabled: boolean; ok?: boolean }> {
  const res = await fetch("/api/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`unlock ${res.status}`)
  return (await res.json()) as { enabled: boolean; ok?: boolean }
}

// Whether ACTION_CODE is set on this deployment; null if the check failed.
export async function actionsEnabled(): Promise<boolean | null> {
  try {
    return (await post({ check: true })).enabled
  } catch {
    return null
  }
}

// Checks a code on the server. On success, remembers the unlock for this
// session and lets the waiting action run.
export async function tryUnlock(code: string): Promise<UnlockResult> {
  try {
    const answer = await post({ code })
    if (!answer.enabled) return "off"
    if (!answer.ok) return "wrong"
  } catch {
    return "error"
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1")
  } catch {
    // Storage blocked: the unlock lasts until the page reloads.
  }
  finish(true)
  return "ok"
}

export function cancelUnlock() {
  finish(false)
}

// Locks actions again; the next action asks for the code.
export function lock() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored to remove.
  }
  set({ unlocked: false })
}
