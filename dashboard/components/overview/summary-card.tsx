import { type Stage, countText, stages } from "@/components/overview/summary"
import { Skeleton } from "@/components/ui/skeleton"
import { defectsDefaultLimit } from "@/lib/config"
import { stageLabel } from "@/lib/labels"
import { cn } from "@/lib/utils"

type Props = {
  stage: Stage
  // Defects counted in each stage across the pilot area, or null until loaded.
  counts: Record<Stage, number | null>
  onStage: (stage: Stage) => void
  className?: string
}

// Card 1: three numbers for the whole pilot area. They are a button group:
// the selected one decides what the map, the list and the stepper show.
export function SummaryCard({ stage, counts, onStage, className }: Props) {
  return (
    <section aria-label="Stage" className={cn("panel p-1.5", className)}>
      <div role="group" aria-label="Show defects that are" className="grid grid-cols-3 gap-1">
        {stages.map((s) => {
          const count = counts[s]
          return (
            <button
              key={s}
              type="button"
              aria-pressed={s === stage}
              onClick={() => onStage(s)}
              className={cn(
                "flex cursor-pointer flex-col items-start rounded-lg px-2.5 py-2 text-left outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring",
                s === stage && "bg-white/10 hover:bg-white/10"
              )}
            >
              <span className="tabular text-3xl leading-none font-semibold">
                {count === null ? <Skeleton className="h-8 w-10" /> : countText(count, defectsDefaultLimit)}
              </span>
              <span className="mt-1.5 text-xs text-muted-foreground">{stageLabel[s]}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
