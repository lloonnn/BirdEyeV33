import type { DefectStatus, DefectType, LocationReason, UrgencyBand, WorkOrderStatus } from "@/lib/api-types"

// The words that go with every colour and shape (brief section 3).

// Every defect type label lives here and only here. Add a type in one place.
const typeLabels: Record<DefectType, string> = {
  pothole: "Pothole",
  crack: "Crack",
}

// Plurals for counted types, lower case: "2 potholes".
const typePlurals: Record<DefectType, string> = {
  pothole: "potholes",
  crack: "cracks",
}

// "1 pothole", "2 potholes". An unknown type uses its raw value, plus "s".
export function typeCount(type: string, n: number): string {
  if (n === 1) return `1 ${typeName(type).toLowerCase()}`
  return `${n} ${typePlurals[type as DefectType] ?? `${type.toLowerCase()}s`}`
}

// Crew type labels. `crew_type` is free text in v0, so this map holds the
// values seen so far.
const crewLabels: Record<string, string> = {
  patching: "Patching",
  "crack sealing": "Crack sealing",
}

// The label for a crew type. An unknown value shows with a capital first letter.
export function crewName(crew: string): string {
  return crewLabels[crew] ?? crew.charAt(0).toUpperCase() + crew.slice(1)
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

// Work order statuses in words (decision 70).
export const workOrderStatusLabel: Record<WorkOrderStatus, string> = {
  pending_approval: "Pending",
  approved: "Approved",
  done: "Done",
  rejected: "Rejected",
}

// Location reasons in words, for "Why it ranks here" (decision 85). No street
// or place names (decision 91).
const locationReasonLabels: Record<LocationReason, string> = {
  school: "near a school",
  main_road: "on a main road",
  junction: "at a junction",
}

// The words for a location reason. A value this map does not know shows its
// raw value with a capital first letter.
export function locationReasonName(reason: string): string {
  return locationReasonLabels[reason as LocationReason] ?? reason.charAt(0).toUpperCase() + reason.slice(1)
}

export const bandLabel: Record<UrgencyBand, string> = {
  high: "Fix first",
  medium: "Soon",
  low: "Low",
}
