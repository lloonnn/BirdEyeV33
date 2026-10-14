"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CloudOffIcon } from "lucide-react"

import { LeafletMap } from "@/components/map/map-loader"
import { MockBanner } from "@/components/mock-banner"
import { toPin } from "@/components/overview/defect-pins"
import { MapFilters, type DefectFilters } from "@/components/overview/map-filters"
import { MapLegend } from "@/components/overview/map-legend"
import { Skeleton } from "@/components/ui/skeleton"
import { getDefects, usesMock } from "@/lib/api"
import { ApiError, type Bbox, type Defect } from "@/lib/api-types"
import { defectsPollMs, defectsReloadDebounceMs } from "@/lib/config"
import { setLastUpdated } from "@/lib/last-updated"
import { formatClock } from "@/lib/time"

type Loaded = { key: string; defects: Defect[]; at: Date }
type Failure = { key: string; error: unknown }

function failureText(error: unknown, lastAt: Date | undefined): string {
  const head =
    error instanceof ApiError && error.status !== 0
      ? `The server returned an error: ${error.message}`
      : "Can't reach the server."
  return lastAt ? `${head} Showing the last data from ${formatClock(lastAt)}.` : head
}

export function Overview() {
  const [bbox, setBbox] = useState<Bbox | null>(null)
  const [filters, setFilters] = useState<DefectFilters>({ showClosed: false })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pollTick, setPollTick] = useState(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The map reports its visible area on load and after each pan or zoom.
  const onViewChange = useCallback((next: Bbox) => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setBbox(next), defectsReloadDebounceMs)
  }, [])

  useEffect(() => () => clearTimeout(debounce.current), [])

  useEffect(() => {
    const id = setInterval(() => setPollTick((t) => t + 1), defectsPollMs)
    return () => clearInterval(id)
  }, [])

  const { type, status } = filters
  const key = bbox ? JSON.stringify([bbox, type, status]) : null

  useEffect(() => {
    if (!bbox || !key) return
    const controller = new AbortController()
    getDefects({ bbox, type, status }, { signal: controller.signal })
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
  }, [bbox, type, status, key, pollTick])

  // Keep the last data on screen while a new area loads or the server is down.
  const shown = useMemo(() => {
    const defects = loaded?.defects ?? []
    if (status || filters.showClosed) return defects
    return defects.filter((d) => d.status !== "confirmed" && d.status !== "rejected")
  }, [loaded, status, filters.showClosed])

  const pins = useMemo(() => shown.map(toPin), [shown])
  const loading = loaded?.key !== key && failure?.key !== key
  const firstLoad = loading && !loaded

  return (
    <div className="fixed inset-0">
      <div className="absolute inset-0">
        <LeafletMap pins={pins} onViewChange={onViewChange} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex flex-col items-center gap-2 px-4">
        {usesMock("getDefects") && <MockBanner className="pointer-events-auto" />}
        {failure && (
          <div
            role="alert"
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <CloudOffIcon className="size-4 text-status-high" aria-hidden />
            {failureText(failure.error, loaded?.at)}
          </div>
        )}
      </div>

      <div className="absolute top-16 left-4 z-10 w-60 rounded-lg border border-border bg-card p-3 shadow-lg">
        <MapFilters value={filters} onChange={setFilters} />
        <div className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground" aria-live="polite">
          {firstLoad ? (
            <Skeleton className="h-4 w-32" />
          ) : !loaded ? (
            "No data loaded."
          ) : shown.length === 0 ? (
            "No defects in this area."
          ) : (
            <>
              <span className="tabular text-foreground">{shown.length}</span>{" "}
              {shown.length === 1 ? "defect" : "defects"} in this area
            </>
          )}
        </div>
      </div>

      <MapLegend className="absolute bottom-4 left-4 z-10" />
    </div>
  )
}
