import type { AreaStats } from "@/components/overview/summary"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Card 1: two big numbers for the whole pilot area.
export function SummaryCard({ stats, loading, className }: { stats: AreaStats | null; loading: boolean; className?: string }) {
  const items = [
    { value: stats?.open, label: "open" },
    { value: stats?.fixFirst, label: "fix first" },
  ]
  return (
    <section aria-label="Summary" className={cn("panel grid grid-cols-2 gap-4", className)}>
      {items.map((item) => (
        <div key={item.label}>
          <div className="tabular text-3xl leading-none font-semibold">
            {loading && !stats ? <Skeleton className="h-8 w-12" /> : (item.value ?? "–")}
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </section>
  )
}
