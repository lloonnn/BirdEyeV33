import { TypeBadge, UrgencyBadge } from "@/components/overview/badges"
import { Skeleton } from "@/components/ui/skeleton"
import type { Defect } from "@/lib/api-types"
import { fixFirstCount } from "@/lib/config"
import { statusLabel } from "@/lib/labels"
import { cn } from "@/lib/utils"

type Props = {
  defects: Defect[] | null
  loading: boolean
  selectedId: number | null
  onSelect: (defect: Defect) => void
  className?: string
}

// Bottom panel: the most urgent open defects in the pilot precinct (brief section 5.1).
export function FixFirstList({ defects, loading, selectedId, onSelect, className }: Props) {
  return (
    <section className={cn("rounded-lg border border-border bg-card shadow-lg", className)}>
      <h2 className="flex items-baseline justify-between border-b border-border px-3 py-2 text-xs font-medium">
        Fix first
        <span className="font-normal text-muted-foreground">Most urgent open defects, whole precinct</span>
      </h2>
      {loading && !defects ? (
        <div className="flex flex-col gap-2 p-3">
          {Array.from({ length: fixFirstCount }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : !defects ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">No data loaded.</p>
      ) : defects.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">No open defects in the precinct.</p>
      ) : (
        <ol className="p-1">
          {defects.map((d, i) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                aria-current={d.id === selectedId ? "true" : undefined}
                className={cn(
                  "grid w-full grid-cols-[1.25rem_5.5rem_6rem_1fr_3rem] items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent",
                  d.id === selectedId && "bg-accent"
                )}
              >
                <span className="tabular text-muted-foreground">{i + 1}</span>
                <TypeBadge type={d.type} />
                <UrgencyBadge band={d.urgency_band} />
                <span className="truncate text-muted-foreground">
                  {statusLabel[d.status]} · <span className="tabular">#{d.id}</span>
                </span>
                <span className="tabular text-right">{d.urgency.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
