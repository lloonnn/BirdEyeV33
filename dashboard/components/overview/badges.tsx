import type { PinTone } from "@/components/map/leaflet-map"
import type { Defect, DefectType, UrgencyBand } from "@/lib/api-types"
import { bandLabel, statusLabel, typeName } from "@/lib/labels"
import { cn } from "@/lib/utils"

// Colour means urgency only. Type and status are plain text, never coloured.
// Every colour is paired with its word (brief section 3).

export const toneText: Record<PinTone, string> = {
  high: "text-status-high",
  medium: "text-status-medium",
  low: "text-status-low",
  done: "text-status-done",
  neutral: "text-status-neutral",
}

export function Dot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cn("size-3 shrink-0", className)} aria-hidden>
      <circle cx="6" cy="6" r="5" fill="currentColor" />
    </svg>
  )
}

const badge = "inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-xs"

export function TypeBadge({ type }: { type: DefectType }) {
  return <span className={badge}>{typeName(type)}</span>
}

export function UrgencyBadge({ band }: { band: UrgencyBand }) {
  return (
    <span className={badge}>
      <Dot className={toneText[band]} />
      {bandLabel[band]}
    </span>
  )
}

export function StatusBadge({ defect }: { defect: Defect }) {
  return <span className={badge}>{statusLabel[defect.status]}</span>
}
