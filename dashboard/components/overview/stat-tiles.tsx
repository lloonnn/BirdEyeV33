import type { PrecinctStats } from "@/components/overview/precinct"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type Props = {
  stats: PrecinctStats | null
  loading: boolean
  className?: string
}

// Left column tiles (brief section 5.1), counted over the whole pilot
// precinct, not just the map view.
export function StatTiles({ stats, loading, className }: Props) {
  const tiles: { label: string; value: number | undefined; note?: string }[] = [
    { label: "Open defects", value: stats?.open },
    { label: "Fix first", value: stats?.fixFirst },
    // v0 has no confirmation time, so "this week" cannot be counted yet.
    { label: "Confirmed", value: stats?.confirmed, note: "all time" },
  ]

  return (
    <section className={cn("rounded-lg border border-border bg-card p-3 shadow-lg", className)}>
      <h2 className="mb-2 text-xs text-muted-foreground">Whole pilot precinct</h2>
      <dl className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-0.5">
            <dt className="text-[11px] leading-tight text-muted-foreground">
              {t.label}
              {t.note && <span className="block">{t.note}</span>}
            </dt>
            <dd className="tabular text-xl font-semibold">
              {loading && !stats ? <Skeleton className="mt-1 h-6 w-8" /> : (t.value ?? "–")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
