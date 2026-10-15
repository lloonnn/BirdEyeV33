"use client"

import { useEffect, useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { getBrief } from "@/lib/api"
import type { Brief } from "@/lib/api-types"
import { formatClock } from "@/lib/time"
import { cn } from "@/lib/utils"

type State = { status: "loading" } | { status: "ready"; brief: Brief | null } | { status: "error" }

// The morning brief (brief section 5.1): a panel on the Overview, not a page.
// Collapsed by default to its time and first line; a click shows every line.
export function BriefCard({ refreshKey, className }: { refreshKey: number; className?: string }) {
  const [state, setState] = useState<State>({ status: "loading" })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getBrief({ signal: controller.signal })
      .then((brief) => setState({ status: "ready", brief }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" })
      })
    return () => controller.abort()
  }, [refreshKey])

  if (state.status === "loading") {
    return (
      <section aria-label="Morning brief" className={cn("panel", className)}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-4 w-full" />
      </section>
    )
  }
  if (state.status === "error" || !state.brief) {
    return (
      <section aria-label="Morning brief" className={cn("panel text-xs text-muted-foreground", className)}>
        {state.status === "error" ? "Can't reach the server to load the brief." : "No brief yet."}
      </section>
    )
  }

  // v0 sends one text; each line is one point.
  const lines = state.brief.text.split("\n").filter((line) => line.trim())
  return (
    <section aria-label="Morning brief" className={cn("panel p-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="brief-lines"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col gap-1 rounded-[16px] p-4 text-left hover:bg-white/5"
      >
        <span className="flex w-full items-center justify-between text-xs font-medium">
          <span>
            Morning brief · <span className="tabular">{formatClock(new Date(state.brief.created_at))}</span>
          </span>
          <ChevronDownIcon className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </span>
        {!open && <span className="line-clamp-1 text-sm text-muted-foreground">{lines[0]}</span>}
      </button>
      {open && (
        <ul id="brief-lines" className="-mt-2 flex list-disc flex-col gap-1.5 px-4 pb-4 pl-8 text-sm text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
