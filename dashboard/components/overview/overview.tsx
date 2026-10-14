"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CloudOffIcon } from "lucide-react"

import type { MapFocus } from "@/components/map/leaflet-map"
import { LeafletMap } from "@/components/map/map-loader"
import { MockBanner } from "@/components/mock-banner"
import { DefectPanel } from "@/components/overview/defect-panel"
import { toPin } from "@/components/overview/defect-pins"
import { FixFirstList } from "@/components/overview/fix-first-list"
import { MapFilters, type DefectFilters } from "@/components/overview/map-filters"
import { MapLegend } from "@/components/overview/map-legend"
import { fixFirst, precinctStats } from "@/components/overview/precinct"
import { StatTiles } from "@/components/overview/stat-tiles"
import { useDefects } from "@/components/overview/use-defects"
import { Skeleton } from "@/components/ui/skeleton"
import { usesMock } from "@/lib/api"
import { ApiError, type Bbox, type Defect, type DefectsQuery } from "@/lib/api-types"
import { defectsReloadDebounceMs, precinctBbox } from "@/lib/config"
import { formatClock } from "@/lib/time"
import { cn } from "@/lib/utils"

// The whole precinct, most urgent first: feeds the Fix first list and tiles.
const precinctQuery: DefectsQuery = { bbox: precinctBbox, sort: "urgency_desc" }

function failureText(error: unknown, lastAt: Date | null): string {
  const head =
    error instanceof ApiError && error.status !== 0
      ? `The server returned an error: ${error.message}`
      : "Can't reach the server."
  return lastAt ? `${head} Showing the last data from ${formatClock(lastAt)}.` : head
}

export function Overview() {
  const [bbox, setBbox] = useState<Bbox | null>(null)
  const [filters, setFilters] = useState<DefectFilters>({ showClosed: false })
  const [selected, setSelected] = useState<Defect | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The map reports its visible area on load and after each pan or zoom.
  const onViewChange = useCallback((next: Bbox) => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setBbox(next), defectsReloadDebounceMs)
  }, [])

  useEffect(() => () => clearTimeout(debounce.current), [])

  const { type, status } = filters
  const view = useDefects(bbox ? { bbox, type, status } : null)
  const precinct = useDefects(precinctQuery)

  // Keep the last data on screen while a new area loads or the server is down.
  const shown = useMemo(() => {
    const defects = view.defects ?? []
    if (status || filters.showClosed) return defects
    return defects.filter((d) => d.status !== "confirmed" && d.status !== "rejected")
  }, [view.defects, status, filters.showClosed])

  const pins = useMemo(() => shown.map(toPin), [shown])
  const topFive = useMemo(() => (precinct.defects ? fixFirst(precinct.defects) : null), [precinct.defects])
  const stats = useMemo(() => (precinct.defects ? precinctStats(precinct.defects) : null), [precinct.defects])

  const onPinClick = useCallback(
    (id: number) => setSelected(shown.find((d) => d.id === id) ?? null),
    [shown]
  )
  const onListSelect = useCallback((defect: Defect) => {
    setSelected(defect)
    setFocus({ lat: defect.lat, lon: defect.lon, seq: Date.now() })
  }, [])
  const closePanel = useCallback(() => setSelected(null), [])

  const error = view.error ?? precinct.error
  const lastAt = [view.at, precinct.at].reduce<Date | null>(
    (latest, at) => (at && (!latest || at > latest) ? at : latest),
    null
  )

  return (
    <div className="fixed inset-0">
      <div className="absolute inset-0">
        <LeafletMap
          pins={pins}
          onViewChange={onViewChange}
          onPinClick={onPinClick}
          selectedId={selected?.id ?? null}
          focus={focus}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex flex-col items-center gap-2 px-4">
        {usesMock("getDefects") && <MockBanner className="pointer-events-auto" />}
        {error !== null && (
          <div
            role="alert"
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <CloudOffIcon className="size-4 text-status-high" aria-hidden />
            {failureText(error, lastAt)}
          </div>
        )}
      </div>

      <div className="absolute top-16 left-4 z-10 flex w-64 flex-col gap-3">
        <StatTiles stats={stats} loading={precinct.loading} />
        <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
          <MapFilters value={filters} onChange={setFilters} />
          <div className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground" aria-live="polite">
            {view.loading && !view.defects ? (
              <Skeleton className="h-4 w-32" />
            ) : !view.defects ? (
              "No data loaded."
            ) : shown.length === 0 ? (
              "No defects in this area."
            ) : (
              <>
                <span className="tabular text-foreground">{shown.length}</span>{" "}
                {shown.length === 1 ? "defect" : "defects"} in this map view
              </>
            )}
          </div>
        </div>
      </div>

      <MapLegend className="absolute bottom-4 left-4 z-10" />

      <FixFirstList
        defects={topFive}
        loading={precinct.loading}
        selectedId={selected?.id ?? null}
        onSelect={onListSelect}
        className={cn(
          "absolute bottom-4 left-60 z-10 mx-auto max-w-xl",
          selected ? "right-[24.5rem]" : "right-16"
        )}
      />

      {selected && (
        <DefectPanel
          key={selected.id}
          defect={selected}
          now={(lastAt ?? new Date(selected.last_seen)).getTime()}
          onClose={closePanel}
          className="absolute top-16 right-4 bottom-24 z-20 w-88"
        />
      )}
    </div>
  )
}
