import type { MapPin } from "@/components/map/leaflet-map"
import type { Defect } from "@/lib/api-types"
import { bandLabel, statusLabel, typeName } from "@/lib/labels"

export function toPin(defect: Defect): MapPin {
  return {
    id: defect.id,
    lat: defect.lat,
    lon: defect.lon,
    // Colour means urgency only; the hover text names the status.
    tone: defect.urgency_band,
    label: `${typeName(defect.type)} · ${bandLabel[defect.urgency_band]} · ${statusLabel[defect.status]}`,
  }
}
