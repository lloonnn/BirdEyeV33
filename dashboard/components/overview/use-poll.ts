"use client"

import { useEffect, useRef, useState } from "react"

// A tick that goes up every `ms` while the tab is visible, and once when the
// tab becomes visible again. Off when `enabled` is false; skips while `paused`,
// for example while a dialog is open or an action runs. The contract has no
// push channel, so the page reloads on this tick.
export function usePoll(ms: number, enabled: boolean, paused: boolean): number {
  const [tick, setTick] = useState(0)
  const pausedRef = useRef(paused)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!enabled) return
    const bump = () => {
      if (document.visibilityState === "visible" && !pausedRef.current) setTick((t) => t + 1)
    }
    const id = setInterval(bump, ms)
    document.addEventListener("visibilitychange", bump)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", bump)
    }
  }, [ms, enabled])

  return tick
}
