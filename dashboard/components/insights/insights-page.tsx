"use client"

import { useMemo } from "react"
import { CircleCheckIcon, ClockIcon, CloudOffIcon, LayersIcon } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  bandOrder,
  countBy,
  insightsQuery,
  newPerDay,
  realDefects,
  stageOrder,
  stageRows,
  weekTotals,
} from "@/components/insights/insights"
import { Attention, Card, Donut, Funnel, Kpi, Plot, bandColor, tooltipClass, type Slice } from "@/components/insights/insight-parts"
import { usePoll } from "@/components/overview/use-poll"
import { useDefects } from "@/components/overview/use-defects"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { inMockMode } from "@/lib/api"
import { ApiError, type Defect } from "@/lib/api-types"
import { defectsPollMs } from "@/lib/config"
import { bandLabel, stageLabel, statusLabel, typeName } from "@/lib/labels"
import { formatClock, formatDay } from "@/lib/time"

// Two neutral greys for the type ring; colour means urgency only.
const typeGreys = ["var(--muted-foreground)", "color-mix(in oklab, var(--status-neutral) 60%, var(--card))"]

const days = 14
// Rows in the "Needs attention" list. Starting value, to be tuned.
const attentionCount = 4

const dayConfig = { count: { label: "New defects", color: "var(--status-neutral)" } }

function failureText(error: unknown, lastAt: Date | null): string {
  const head =
    error instanceof ApiError && error.status !== 0
      ? `The server returned an error: ${error.message}`
      : "Can't reach the server."
  return lastAt ? `${head} Showing the last data from ${formatClock(lastAt)}.` : head
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Insights page: counts over every defect the backend holds, worked out here
// from one GET /defects. Colour means urgency only; every other mark is grey.
function derive(defects: Defect[], at: Date) {
  const stageCounts = countBy(defects, (d) => d.status)
  const stages = stageRows(defects).map((r) => ({
    ...r,
    name: upperFirst(r.status in stageLabel ? stageLabel[r.status as keyof typeof stageLabel] : statusLabel[r.status].toLowerCase()),
  }))
  // Fix first defects that are not fixed yet, and how many of those nobody has checked.
  const fixFirstOpen = stages.slice(0, 3).reduce((n, r) => n + r.high, 0)
  const fixFirstToCheck = stages[0]?.high ?? 0
  const open = (stageCounts.get("detected") ?? 0) + (stageCounts.get("verified") ?? 0) + (stageCounts.get("scheduled") ?? 0)
  const done = (stageCounts.get("fixed") ?? 0) + (stageCounts.get("confirmed") ?? 0)

  const bandCounts = countBy(defects, (d) => d.urgency_band)
  const urgencySlices: Slice[] = bandOrder.map((b) => ({
    name: bandLabel[b],
    count: bandCounts.get(b) ?? 0,
    color: bandColor[b],
  }))

  const typeCounts = countBy<string>(defects, (d: Defect) => d.type)
  const typeSlices: Slice[] = [...typeCounts]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count], i) => ({ name: typeName(type), count, color: typeGreys[i % typeGreys.length] }))

  const total = defects.length
  const share = (n: number) => Math.round((n / Math.max(total, 1)) * 100)
  const topBand = [...urgencySlices].sort((x, y) => y.count - x.count)[0]
  const topType = typeSlices[0]
  const stageTakeaway =
    fixFirstOpen === 0
      ? "No Fix first defects are open."
      : `${fixFirstOpen} Fix first ${fixFirstOpen === 1 ? "defect is" : "defects are"} still open, ${fixFirstToCheck} of them not checked yet.`
  const shareTakeaway = topBand && topType ? `Biggest groups: ${topBand.name} (${share(topBand.count)}%), ${topType.name} (${share(topType.count)}%).` : undefined

  const perDay = newPerDay(defects, at, days)
  const isOpen = (d: Defect) => stageOrder.indexOf(d.status) < 3
  const sparkTotal = perDay.map((d) => d.count)
  const sparkOpen = newPerDay(defects.filter(isOpen), at, days).map((d) => d.count)
  const sparkDone = newPerDay(defects.filter((d) => !isOpen(d)), at, days).map((d) => d.count)
  const weeks = weekTotals(perDay)
  const diff = weeks.thisWeek - weeks.lastWeek
  const totalChange = diff === 0 ? "No change" : `${diff > 0 ? "+" : "-"}${Math.abs(diff)} vs previous 7 days`
  const dayTakeaway = `${weeks.thisWeek} new in the last 7 days, ${weeks.lastWeek} in the 7 days before.`
  const zeroDays = perDay.filter((d) => d.count === 0).length
  const chartDays = perDay.map((d) => ({ day: formatDay(`${d.key}T00:00:00+08:00`), count: d.count }))

  // The open defects with the highest urgency score, and how long each has been open.
  const attention = defects
    .filter(isOpen)
    .sort((x, y) => y.urgency - x.urgency)
    .slice(0, attentionCount)
    .map((d) => ({ id: d.id, type: typeName(d.type), band: d.urgency_band, status: d.status, urgency: d.urgency, days: Math.max(0, Math.floor((at.getTime() - Date.parse(d.first_seen)) / 86_400_000)) }))
  return {
    stages, open, done, fixFirstOpen, urgencySlices, typeSlices, total, share,
    stageTakeaway, shareTakeaway, dayTakeaway, zeroDays, chartDays, attention,
    sparkTotal, sparkOpen, sparkDone, totalChange,
  }
}

export function InsightsPage() {
  // Real mode only; usePoll already pauses while the tab is hidden.
  const pollTick = usePoll(defectsPollMs, !inMockMode, false)
  const { defects: all, at, error } = useDefects(insightsQuery, 0, pollTick)
  const defects = useMemo(() => (all ? realDefects(all) : null), [all])
  const ready = defects !== null && at !== null
  const truncated = all !== null && all.length === insightsQuery.limit
  // Worked out once per load, not on every render.
  const {
    stages, open, done, fixFirstOpen, urgencySlices, typeSlices, total, share,
    stageTakeaway, shareTakeaway, dayTakeaway, zeroDays, chartDays, attention,
    sparkTotal, sparkOpen, sparkDone, totalChange,
  } = useMemo(() => derive(defects ?? [], at ?? new Date(0)), [defects, at])

  const empty = ready && defects.length === 0

  return (
    <div className="flex h-dvh min-h-[680px] flex-col gap-4 px-4 pt-19 pb-4">
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-3">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground">Overview of defects and repairs</p>
      </header>

      {error !== null && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#171717] px-4 py-3 text-sm">
          <CloudOffIcon className="size-4 text-status-high" aria-hidden />
          {failureText(error, at)}
        </div>
      )}
      {truncated && (
        <p className="rounded-xl border border-white/[0.08] bg-[#171717] px-4 py-3 text-sm text-muted-foreground">
          Showing the {insightsQuery.limit} most urgent; counts are partial.
        </p>
      )}

      {empty ? (
        <p className="rounded-2xl border border-white/[0.08] bg-[#171717] p-6 text-sm text-muted-foreground">No defects yet.</p>
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-3 gap-4">
            <Kpi
              icon={<LayersIcon aria-hidden />}
              value={ready ? total : null}
              label="Total defects"
              change={ready ? totalChange : undefined}
              spark={ready ? sparkTotal : undefined}
              sparkLabel="New defects per day, last 14 days"
            />
            <Kpi
              icon={<ClockIcon aria-hidden />}
              value={ready ? open : null}
              label="Open"
              change={ready ? `${fixFirstOpen} of them Fix first` : undefined}
              spark={ready ? sparkOpen : undefined}
              sparkLabel="New open defects per day, last 14 days"
            />
            <Kpi
              icon={<CircleCheckIcon aria-hidden />}
              value={ready ? done : null}
              label="Fixed or confirmed"
              change={ready ? `${share(done)}% of all defects` : undefined}
              share={ready ? done / Math.max(total, 1) : undefined}
              spark={ready ? sparkDone : undefined}
              sparkLabel="New fixed or confirmed defects per day, last 14 days"
            />
          </div>

          <div className="grid min-h-0 flex-[1.05] grid-cols-2 gap-4">
            <Card
              title="Where work waits"
              text="How many defects are at each step, from first sighting to confirmed repair."
              takeaway={ready ? stageTakeaway : undefined}
            >
              {ready ? <Funnel rows={stages} /> : <Skeleton className="min-h-0 flex-1" />}
            </Card>

            <Card
              title="Share of defects"
              text="How the defects split by urgency and by type."
              takeaway={ready ? shareTakeaway : undefined}
            >
              {ready ? (
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
                  <Donut title="By urgency" noun="urgency level" slices={urgencySlices} />
                  <Donut title="By type" noun="type" slices={typeSlices} />
                </div>
              ) : (
                <Skeleton className="min-h-0 flex-1" />
              )}
            </Card>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
            <Card
              title="New defects per day, last 14 days"
              text="How many defects were first seen on each day, in Malaysia time."
              takeaway={ready ? dayTakeaway : undefined}
              aside={
                ready && zeroDays > days / 2 ? (
                  <p className="text-xs text-muted-foreground">Most days had no new defects.</p>
                ) : undefined
              }
            >
              {ready ? (
                <Plot label={`New defects per day: ${chartDays.map((d) => `${d.day} ${d.count}`).join(", ")}`}>
                  <ChartContainer config={dayConfig} className="absolute inset-0 aspect-auto h-full w-full">
                    <BarChart data={chartDays} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} interval={1} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={12} domain={[0, (max: number) => Math.max(max, 1)]} />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" className={tooltipClass} />} />
                      <Bar dataKey="count" fill="var(--status-neutral)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                    </BarChart>
                  </ChartContainer>
                </Plot>
              ) : (
                <Skeleton className="min-h-0 flex-1" />
              )}
            </Card>

            <Card title="Needs attention" text="Open defects with the highest urgency score." takeaway={ready ? "Select one to see it on the map." : undefined}>
              {ready ? <Attention rows={attention} /> : <Skeleton className="min-h-0 flex-1" />}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
