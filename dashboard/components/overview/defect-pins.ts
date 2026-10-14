import type { MapPin, PinTone } from "@/components/map/leaflet-map"
import type { Defect } from "@/lib/api-types"
import { bandLabel, statusLabel, typeName } from "@/lib/labels"

// Colour means urgency. Scheduled defects are grey: their repair is already
// booked, so urgency no longer asks for action. The hover text names the status.
export function pinTone(defect: Defect): PinTone {
  return defect.status === "scheduled" ? "neutral" : defect.urgency_band
}

export function toPin(defect: Defect): MapPin {
  return {
    id: defect.id,
    lat: defect.lat,
    lon: defect.lon,
    tone: pinTone(defect),
    label: `${typeName(defect.type)} · ${bandLabel[defect.urgency_band]} · ${statusLabel[defect.status]}`,
  }
}
