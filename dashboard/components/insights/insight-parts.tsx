"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Area, AreaChart, Cell, Pie, PieChart } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import type { DefectStatus, UrgencyBand } from "@/lib/api-types"
import { bandLabel, statusLabel } from "@/lib/labels"
import { cn } from "@/lib/utils"

// The one card surface every Insights card shares.
export const surface =
  "rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#1a1a1a] to-[#141414] p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"

// For anything clickable: lifts 1px and brightens the border. No movement when
// the viewer asks for reduced motion.
export const lift =
  "transition duration-150 hover:-translate-y-px hover:border-white/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0"

// Chart tooltips use the card surface and the page font.
export const tooltipClass =
  "rounded-xl border-white/10 bg-[#171717] font-sans shadow-xl"

export const bandColor: Record<UrgencyBand, string> = {
  high: "var(--status-high)",
  medium: "var(--status-medium)",
  low: "var(--status-low)",
}

export function Card({
  title,
  text,
  takeaway,
  aside,
  className,
  children,
}: {
  title: string
  text: string
  takeaway?: string
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn(surface, "flex min-h-0 min-w-0 flex-col gap-2 p-4", className)}>
      <header>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base leading-6 font-medium">{title}</h2>
          {aside}
        </div>
        <p className="truncate text-sm text-muted-foreground" title={text}>{text}</p>
        <p className="min-h-5 truncate text-sm font-medium" title={takeaway}>{takeaway}</p>
      </header>
      {children}
    </section>
  )
}

// The chart area of a card: takes the height the header leaves; the chart fills it.
export function Plot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className="relative min-h-0 flex-1">
      {children}
    </div>
  )
}

// A KPI: icon chip, number, label, a change line and a 14-day sparkline.
export function Kpi({
  icon,
  value,
  label,
  change,
  spark,
  sparkLabel,
  share,
}: {
  icon: React.ReactNode
  value: number | null
  label: string
  change?: string
  spark?: number[]
  sparkLabel: string
  share?: number
}) {
  const data = spark?.map((count, i) => ({ i, count }))
  return (
    <div className={cn(surface, "flex shrink-0 flex-col gap-2 p-4")}>
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-muted-foreground [&>svg]:size-4">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          {value === null ? (
            <Skeleton className="mt-1 h-8 w-16" />
          ) : (
            <p className="tabular text-[32px] leading-9 font-semibold">{value}</p>
          )}
        </div>
        {data && (
          <div role="img" aria-label={sparkLabel} className="h-10 w-24 shrink-0">
            <ChartContainer config={{}} className="aspect-auto h-full w-full">
              <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                <Area
                  dataKey="count"
                  type="linear"
                  stroke="var(--muted-foreground)"
                  fill="var(--muted-foreground)"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <p className="min-h-4 shrink-0 text-xs text-muted-foreground tabular-nums">{change}</p>
        {share !== undefined && (
          <div role="img" aria-label={`${Math.round(share * 100)}% of defects`} className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full bg-muted-foreground" style={{ width: `${share * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

export type FunnelRow = { status: DefectStatus; name: string; total: number }

// Five horizontal bars in lifecycle order, scaled to the largest count. The
// bars grow from zero on first load (400 ms).
export function Funnel({ rows }: { rows: FunnelRow[] }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <ul className="flex min-h-0 flex-1 flex-col justify-between" aria-label={`Where work waits: ${rows.map((r) => `${r.name} ${r.total}`).join(", ")}`}>
      {rows.map((r) => (
        <li key={r.status} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">{r.name}</span>
          <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
            <span
              className="block h-full rounded-full bg-status-neutral transition-[width] duration-[400ms] ease-out motion-reduce:transition-none"
              style={{ width: shown ? `${(r.total / max) * 100}%` : "0%" }}
            />
          </span>
          <span className="tabular w-8 shrink-0 text-right">{r.total}</span>
        </li>
      ))}
    </ul>
  )
}

export type Slice = { name: string; count: number; color: string }

// A thin ring with the total in the centre; its legend sits directly to the right.
export function Donut({ title, noun, slices }: { title: string; noun: string; slices: Slice[] }) {
  const total = slices.reduce((sum, s) => sum + s.count, 0)
  const shown = slices.filter((s) => s.count > 0)
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="flex min-h-0 flex-1 items-center gap-3">
        {shown.length <= 1 ? (
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {shown.length === 0 ? `No ${noun} yet` : `Only one ${noun} so far`}
            {shown.length === 1 && (
              <>
                : <span className="text-foreground">{shown[0].name}</span>, <span className="tabular">{total}</span>
              </>
            )}
          </p>
        ) : (
          <div
            role="img"
            aria-label={`${title}: ${shown.map((s) => `${s.name} ${s.count}`).join(", ")}`}
            className="relative size-20 shrink-0 xl:size-24"
          >
            <ChartContainer config={{}} className="absolute inset-0 aspect-auto h-full w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" className={tooltipClass} />} />
                <Pie
                  data={shown}
                  dataKey="count"
                  nameKey="name"
                  innerRadius="78%"
                  outerRadius="100%"
                  paddingAngle={4}
                  cornerRadius={4}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {shown.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <p className="tabular pointer-events-none absolute inset-0 grid place-items-center text-lg font-semibold">{total}</p>
          </div>
        )}
        {shown.length > 1 && (
          <ul className="grid grid-cols-[auto_auto_2.25rem] items-center gap-x-2 gap-y-1 text-sm">
            {slices.map((s) => (
              <li key={s.name} className="contents">
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="tabular text-right">{s.count}</span>
                <span className="tabular text-right text-xs text-muted-foreground">
                  {total ? Math.round((s.count / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export type AttentionRow = { id: number; type: string; band: UrgencyBand; status: DefectStatus; urgency: number; days: number }

// The open defects with the highest urgency; each row opens it on the Overview.
export function Attention({ rows }: { rows: AttentionRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No open defects.</p>
  return (
    <ul className="flex min-h-0 flex-1 flex-col justify-between">
      {rows.map((d) => (
        <li key={d.id} className="border-t border-white/[0.08] first:border-0">
          <Link
            href={`/?defect=${d.id}`}
            className={cn(
              "-mx-2 my-0.5 flex items-center gap-3 rounded-lg border border-transparent px-2 py-1 text-sm hover:bg-white/[0.03]",
              lift
            )}
          >
            <span className="w-24 shrink-0 truncate font-medium">
              {d.type} <span className="tabular text-muted-foreground">#{d.id}</span>
            </span>
            <span className="flex w-20 shrink-0 items-center gap-2 text-xs">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: bandColor[d.band] }} />
              {bandLabel[d.band]}
            </span>
            <span
              role="img"
              aria-label={`Urgency ${d.urgency.toFixed(2)}`}
              className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]"
            >
              <span className="block h-full rounded-full" style={{ width: `${Math.min(Math.max(d.urgency, 0), 1) * 100}%`, background: bandColor[d.band] }} />
            </span>
            <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {d.days === 0 ? "seen today" : `seen ${d.days} ${d.days === 1 ? "day" : "days"}`}
            </span>
            <span className="sr-only">{statusLabel[d.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
