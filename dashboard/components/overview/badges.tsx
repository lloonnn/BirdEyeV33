import type { PinTone } from "@/components/map/leaflet-map"
import { pinTone } from "@/components/overview/defect-pins"
import type { Defect, DefectType, UrgencyBand } from "@/lib/api-types"
import { bandLabel, statusLabel, typeLabel } from "@/lib/labels"
import { cn } from "@/lib/utils"

// Shapes and colour badges, each paired with its word (brief section 3).

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

export function Ring({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cn("size-3 shrink-0", className)} aria-hidden>
      <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  )
}

const badge = "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs"

// Pothole as a filled circle, crack as a ring, as on the map.
export function TypeBadge({ type }: { type: DefectType }) {
  return (
    <span className={badge}>
      {type === "pothole" ? <Dot /> : <Ring />}
      {typeLabel[type]}
    </span>
  )
}

export function UrgencyBadge({ band }: { band: UrgencyBand }) {
  return (
    <span className={badge}>
      <Dot className={toneText[band]} />
      {bandLabel[band]}
    </span>
  )
}

// Status word with the pin colour it shows on the map.
export function StatusBadge({ defect }: { defect: Defect }) {
  return (
    <span className={badge}>
      <Dot className={toneText[pinTone(defect)]} />
      {statusLabel[defect.status]}
    </span>
  )
}
