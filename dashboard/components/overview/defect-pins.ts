import type { MapPin, PinTone } from "@/components/map/leaflet-map"
import type { Defect } from "@/lib/api-types"
import { bandLabel, statusLabel, typeLabel } from "@/lib/labels"

// Pin colour follows brief section 3: open defects by their urgency band,
// confirmed in green, and scheduled, fixed or rejected in grey, since their
// urgency no longer asks for action.
export function pinTone(defect: Defect): PinTone {
  switch (defect.status) {
    case "confirmed":
      return "done"
    case "scheduled":
    case "fixed":
    case "rejected":
      return "neutral"
    default:
      return defect.urgency_band
  }
}

export function toPin(defect: Defect): MapPin {
  return {
    id: defect.id,
    lat: defect.lat,
    lon: defect.lon,
    tone: pinTone(defect),
    shape: defect.type === "pothole" ? "filled" : "ring",
    label: `${typeLabel[defect.type]} · ${bandLabel[defect.urgency_band]} · ${statusLabel[defect.status]}`,
  }
}
