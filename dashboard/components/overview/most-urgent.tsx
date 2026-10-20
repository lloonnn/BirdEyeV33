import { UrgencyBadge } from "@/components/overview/badges"
import { Skeleton } from "@/components/ui/skeleton"
import type { Defect } from "@/lib/api-types"
import { fixFirstCount } from "@/lib/config"
import { typeName } from "@/lib/labels"
import { cn } from "@/lib/utils"

type Props = {
  defects: Defect[] | null
  loading: boolean
  selectedId: number | null
  // Reference time for "seen <n> days": when the data loaded.
  now: number
  onSelect: (defect: Defect) => void
  className?: string
}

const DAY = 24 * 60 * 60 * 1000

function seenFor(firstSeen: string, now: number): string {
  const days = Math.floor((now - Date.parse(firstSeen)) / DAY)
  if (days < 1) return "seen today"
  return days === 1 ? "seen 1 day" : `seen ${days} days`
}

// Card 2: the most urgent defects of the selected stage in the pilot area.
export function MostUrgent({ defects, loading, selectedId, now, onSelect, className }: Props) {
  return (
    <section aria-labelledby="most-urgent-title" className={cn("panel p-2", className)}>
      <h2 id="most-urgent-title" className="px-2 pt-1 pb-2 text-xs font-medium">
        Most urgent
      </h2>
      {loading && !defects ? (
        <div className="flex flex-col gap-2 px-2 pb-2">
          {Array.from({ length: fixFirstCount }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : !defects ? (
        <p className="px-2 pb-2 text-xs text-muted-foreground">No data loaded.</p>
      ) : defects.length === 0 ? (
        <p className="px-2 pb-2 text-xs text-muted-foreground">Nothing here.</p>
      ) : (
        <ol>
          {defects.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                aria-current={d.id === selectedId ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-white/5",
                  d.id === selectedId && "bg-white/10"
                )}
              >
                <span className="flex items-center gap-2 text-sm">
                  <UrgencyBadge band={d.urgency_band} />
                  <span>{typeName(d.type)}</span>
                  {/* A street name goes here once the contract has one; v0 does not. */}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {seenFor(d.first_seen, now)} · <span className="tabular">#{d.id}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
