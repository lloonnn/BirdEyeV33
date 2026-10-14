import type { PinTone } from "@/components/map/leaflet-map"
import { Dot, Ring, toneText } from "@/components/overview/badges"
import { cn } from "@/lib/utils"

// Every pin colour and shape with its word (brief section 5.1).
const tones: { tone: PinTone; label: string }[] = [
  { tone: "high", label: "Fix first" },
  { tone: "medium", label: "Soon" },
  { tone: "low", label: "Low" },
  { tone: "done", label: "Confirmed" },
  { tone: "neutral", label: "Scheduled, fixed or rejected" },
]

export function MapLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-3 py-2.5 text-xs shadow-lg",
        className
      )}
    >
      <ul className="flex flex-col gap-1.5">
        {tones.map(({ tone, label }) => (
          <li key={tone} className="flex items-center gap-2">
            <Dot className={toneText[tone]} />
            {label}
          </li>
        ))}
      </ul>
      <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-border pt-2.5">
        <li className="flex items-center gap-2">
          <Dot className="text-foreground" />
          Pothole
        </li>
        <li className="flex items-center gap-2">
          <Ring className="text-foreground" />
          Crack
        </li>
      </ul>
    </div>
  )
}
