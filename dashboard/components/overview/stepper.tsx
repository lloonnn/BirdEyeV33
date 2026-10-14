import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type Props = {
  // Position of the open defect in Most urgent (0-based), or null when the
  // open defect is not in the list or nothing is open.
  index: number | null
  count: number
  onStep: (index: number) => void
  onZoom: (delta: 1 | -1) => void
  className?: string
}

const iconButton =
  "flex size-8 items-center justify-center rounded-full text-foreground hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"

// Bottom pill: step through the most urgent defects, and zoom the map.
export function Stepper({ index, count, onStep, onZoom, className }: Props) {
  const position = index === null ? "–" : String(index + 1)
  return (
    <nav aria-label="Most urgent stepper" className={cn("panel flex h-11 items-center gap-1 rounded-full px-1.5 py-0", className)}>
      <button
        type="button"
        aria-label="Previous most urgent"
        disabled={index === null || index <= 0}
        onClick={() => index !== null && onStep(index - 1)}
        className={iconButton}
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-1 text-sm whitespace-nowrap" aria-live="polite">
        <span className="tabular">{position}</span> of <span className="tabular">{count}</span> most urgent
      </span>
      <button
        type="button"
        aria-label="Next most urgent"
        disabled={count === 0 || (index !== null && index >= count - 1)}
        onClick={() => onStep(index === null ? 0 : index + 1)}
        className={iconButton}
      >
        <ChevronRightIcon className="size-4" />
      </button>
      <span className="mx-1 h-5 w-px bg-white/15" aria-hidden />
      <button type="button" aria-label="Zoom out" onClick={() => onZoom(-1)} className={iconButton}>
        <MinusIcon className="size-4" />
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => onZoom(1)} className={iconButton}>
        <PlusIcon className="size-4" />
      </button>
    </nav>
  )
}
