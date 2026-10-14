"use client"

import { useEffect, useState } from "react"

import { getDefects } from "@/lib/api"
import type { Defect, DefectsQuery } from "@/lib/api-types"
import { defectsPollMs } from "@/lib/config"
import { setLastUpdated } from "@/lib/last-updated"

type Loaded = { key: string; defects: Defect[]; at: Date }
type Failure = { key: string; error: unknown }

export type DefectsState = {
  // The last data that loaded, kept on screen while reloading or offline.
  defects: Defect[] | null
  at: Date | null
  // The latest attempt failed (cleared by the next success).
  error: unknown
  // True until the current query has answered once, with data or an error.
  loading: boolean
}

// Loads GET /defects for `query` (null waits), and reloads on the poll
// interval because the contract has no push channel.
export function useDefects(query: DefectsQuery | null): DefectsState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pollTick, setPollTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setPollTick((t) => t + 1), defectsPollMs)
    return () => clearInterval(id)
  }, [])

  const key = query ? JSON.stringify(query) : null

  useEffect(() => {
    if (!key) return
    const q = JSON.parse(key) as DefectsQuery
    const controller = new AbortController()
    getDefects(q, { signal: controller.signal })
      .then((defects) => {
        const at = new Date()
        setLoaded({ key, defects, at })
        setFailure(null)
        setLastUpdated(at)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setFailure({ key, error })
      })
    return () => controller.abort()
  }, [key, pollTick])

  return {
    defects: loaded?.defects ?? null,
    at: loaded?.at ?? null,
    error: failure?.error ?? null,
    loading: key !== null && loaded?.key !== key && failure?.key !== key,
  }
}
