"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CloudOffIcon } from "lucide-react"

import type { MapFit, MapFocus, MapZoom } from "@/components/map/leaflet-map"
import { LeafletMap } from "@/components/map/map-loader"
import { BriefCard } from "@/components/overview/brief-card"
import { DefectPanel } from "@/components/overview/defect-panel"
import { toPin } from "@/components/overview/defect-pins"
import { MapLegend } from "@/components/overview/map-legend"
import { MostUrgent } from "@/components/overview/most-urgent"
import { Stepper } from "@/components/overview/stepper"
import { areaStats, mostUrgent, overviewStatuses, unscheduledStatuses } from "@/components/overview/summary"
import { SummaryCard } from "@/components/overview/summary-card"
import { useDefects } from "@/components/overview/use-defects"
import { getDefect } from "@/lib/api"
import { ApiError, type Bbox, type Defect, type DefectsQuery } from "@/lib/api-types"
import { areaBounds, defectsReloadDebounceMs } from "@/lib/config"
import { formatClock } from "@/lib/time"

// The whole pilot area: every defect the Overview shows (the open count, the
// first fit and the job dialog's names), and the ones still needing a
// decision, most urgent first (Most urgent and the fix first count).
const openQuery: DefectsQuery = { bbox: areaBounds, status: overviewStatuses }
const unscheduledQuery: DefectsQuery = { bbox: areaBounds, status: unscheduledStatuses, sort: "urgency_desc" }

function failureText(error: unknown, lastAt: Date | null): string {
  const head =
    error instanceof ApiError && error.status !== 0
      ? `The server returned an error: ${error.message}`
      : "Can't reach the server."
  return lastAt ? `${head} Showing the last data from ${formatClock(lastAt)}.` : head
}

// The Overview answers two questions: what needs fixing, and where.
// Layout: top bar (in the root layout), left column, map, right panel.
// Every floating panel sits 16 px from the screen edges and from each other.
export function Overview() {
  const [bbox, setBbox] = useState<Bbox | null>(null)
  const [selected, setSelected] = useState<Defect | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [zoom, setZoom] = useState<MapZoom | null>(null)
  // Bumped after every action, so all data reloads from the API.
  const [refreshKey, setRefreshKey] = useState(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // ?defect=<id>, for example from a work order: open that defect on load.
  const linkedId = Number(useSearchParams().get("defect")) || null
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (!linkedId) return
    const controller = new AbortController()
    getDefect(linkedId, { signal: controller.signal })
      .then((defect) => {
        setSelected(defect)
        setFocus({ lat: defect.lat, lon: defect.lon, seq: Date.now() })
        setLinkError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLinkError(
          error instanceof ApiError && error.status === 404
            ? `Defect #${linkedId} no longer exists.`
            : "Can't reach the server to open that defect."
        )
      })
    return () => controller.abort()
  }, [linkedId])

  // The map reports its visible area on load and after each pan or zoom.
  const onViewChange = useCallback((next: Bbox) => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setBbox(next), defectsReloadDebounceMs)
  }, [])

  useEffect(() => () => clearTimeout(debounce.current), [])

  // Detected, verified and scheduled only; keep the last data on screen while
  // a new area loads or the server is down.
  const view = useDefects(bbox ? { bbox, status: overviewStatuses } : null, refreshKey)
  const area = useDefects(openQuery, refreshKey)
  const unscheduled = useDefects(unscheduledQuery, refreshKey)

  const shown = useMemo(() => view.defects ?? [], [view.defects])
  const pins = useMemo(() => shown.map(toPin), [shown])
  const urgent = useMemo(() => (unscheduled.defects ? mostUrgent(unscheduled.defects) : null), [unscheduled.defects])
  const stats = useMemo(
    () => (area.defects && unscheduled.defects ? areaStats(area.defects, unscheduled.defects) : null),
    [area.defects, unscheduled.defects]
  )

  // First load: fit the map to every defect the Overview shows, kept clear of
  // the left column (16 + 320 + 16 px), the top bar (76), the right panel's
  // space (16 + 352 + 16) and the stepper (16 + 44 + 16). Skipped when a
  // ?defect= link asks for one defect.
  const fit = useMemo<MapFit | null>(() => {
    if (linkedId || !area.defects) return null
    const points = area.defects.map((d): [number, number] => [d.lat, d.lon])
    return { points, padding: [76, 384, 76, 352] }
  }, [area.defects, linkedId])

  const onPinClick = useCallback(
    (id: number) => setSelected(shown.find((d) => d.id === id) ?? null),
    [shown]
  )
  const onListSelect = useCallback((defect: Defect) => {
    setSelected(defect)
    setFocus({ lat: defect.lat, lon: defect.lon, seq: Date.now() })
  }, [])
  const closePanel = useCallback(() => setSelected(null), [])
  const onStep = useCallback(
    (index: number) => {
      const defect = urgent?.[index]
      if (defect) onListSelect(defect)
    },
    [urgent, onListSelect]
  )
  const onZoom = useCallback((delta: 1 | -1) => setZoom({ delta, seq: Date.now() }), [])
  const stepIndex = selected && urgent ? urgent.findIndex((d) => d.id === selected.id) : -1
  const reloadAll = useCallback(() => setRefreshKey((k) => k + 1), [])

  const error = view.error ?? area.error ?? unscheduled.error
  const lastAt = [view.at, area.at, unscheduled.at].reduce<Date | null>(
    (latest, at) => (at && (!latest || at > latest) ? at : latest),
    null
  )
  const now = (lastAt ?? new Date(0)).getTime()
  const legendNote =
    view.loading && !view.defects
      ? "Loading defects…"
      : view.defects && shown.length === 0
        ? "No defects in this area."
        : undefined

  return (
    <div className="fixed inset-0">
      <div className="absolute inset-0">
        <LeafletMap
          pins={pins}
          onViewChange={onViewChange}
          onPinClick={onPinClick}
          selectedId={selected?.id ?? null}
          focus={focus}
          zoom={zoom}
          fit={fit}
        />
      </div>

      {(linkError || error !== null) && (
        <div className="pointer-events-none absolute inset-x-0 top-19 z-10 flex flex-col items-center gap-2 px-4">
          {linkError && (
            <div role="alert" className="panel pointer-events-auto rounded-full px-4 py-2 text-sm">
              {linkError}
            </div>
          )}
          {error !== null && (
            <div role="alert" className="panel pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm">
              <CloudOffIcon className="size-4 text-status-high" aria-hidden />
              {failureText(error, lastAt)}
            </div>
          )}
        </div>
      )}

      {/* Left column: 16 px under the top bar and from the left edge. */}
      {/* Scrolls only if an open brief makes the column taller than the screen. */}
      <div className="absolute top-19 left-4 z-10 flex max-h-[calc(100vh-5.75rem)] w-80 flex-col gap-4 overflow-y-auto rounded-[16px] [scrollbar-width:none]">
        <BriefCard refreshKey={refreshKey} />
        <SummaryCard stats={stats} loading={area.loading || unscheduled.loading} />
        <MostUrgent
          defects={urgent}
          loading={unscheduled.loading}
          selectedId={selected?.id ?? null}
          now={now}
          onSelect={onListSelect}
        />
        <MapLegend note={legendNote} />
      </div>

      {/* Bottom centre, 16 px from the bottom edge. */}
      <Stepper
        index={stepIndex >= 0 ? stepIndex : null}
        count={urgent?.length ?? 0}
        onStep={onStep}
        onZoom={onZoom}
        className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2"
      />

      {selected && (
        <DefectPanel
          key={selected.id}
          defect={selected}
          now={lastAt ? now : new Date(selected.last_seen).getTime()}
          refreshKey={refreshKey}
          onChanged={reloadAll}
          known={area.defects ?? []}
          onClose={closePanel}
          className="absolute top-19 right-4 z-20 max-h-[calc(100vh-9.5rem)] w-88"
        />
      )}
    </div>
  )
}
