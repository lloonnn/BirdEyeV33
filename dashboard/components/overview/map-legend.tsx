import type { PinTone } from "@/components/map/leaflet-map"
import { Dot, toneText } from "@/components/overview/badges"
import { cn } from "@/lib/utils"

// Card 3: what each pin colour means. Colour is urgency only.
const lines: { tone: PinTone; label: string }[] = [
  { tone: "high", label: "Fix first" },
  { tone: "medium", label: "Soon" },
  { tone: "low", label: "Low" },
]

export function MapLegend({ note, className }: { note?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("panel text-xs", className)}>
      <ul className="flex flex-col gap-1.5">
        {lines.map(({ tone, label }) => (
          <li key={tone} className="flex items-center gap-2">
            <Dot className={toneText[tone]} />
            {label}
          </li>
        ))}
      </ul>
      {note && <p className="mt-2.5 border-t border-white/10 pt-2 text-muted-foreground">{note}</p>}
    </div>
  )
}
