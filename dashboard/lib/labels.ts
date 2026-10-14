import type { DefectStatus, DefectType, UrgencyBand } from "@/lib/api-types"

// The words that go with every colour and shape (brief section 3).

// Every defect type label lives here and only here. Add a type in one place.
const typeLabels: Record<DefectType, string> = {
  pothole: "Pothole",
  crack: "Crack",
}

// Every known type, in label order: drives the Review tabs and the Wrong type choice.
export const defectTypes = Object.keys(typeLabels) as DefectType[]

// The label for a defect type. A type this map does not know (a future class
// the backend starts sending) shows its raw value with a capital first letter.
export function typeName(type: string): string {
  return typeLabels[type as DefectType] ?? type.charAt(0).toUpperCase() + type.slice(1)
}

export const statusLabel: Record<DefectStatus, string> = {
  detected: "Detected",
  verified: "Verified",
  scheduled: "Scheduled",
  fixed: "Fixed",
  confirmed: "Confirmed",
  rejected: "Rejected",
}

export const bandLabel: Record<UrgencyBand, string> = {
  high: "Fix first",
  medium: "Soon",
  low: "Low",
}
