import type { DefectStatus, DefectType, UrgencyBand } from "@/lib/api-types"

// The words that go with every colour and shape (brief section 3).

export const typeLabel: Record<DefectType, string> = {
  pothole: "Pothole",
  crack: "Crack",
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
