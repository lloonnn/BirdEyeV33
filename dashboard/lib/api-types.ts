// Shapes from docs/api-contract.md v0, field for field. Change this file only
// when the contract changes (decision 62).

export type DefectType = "pothole" | "crack"

export type DefectStatus =
  | "detected"
  | "verified"
  | "scheduled"
  | "fixed"
  | "confirmed"
  | "rejected"

export type UrgencyBand = "high" | "medium" | "low"

// Why the location term scores high (decision 85).
export type LocationReason = "school" | "main_road" | "junction"

// Defect object (decisions 64, 83 to 85).
export type Defect = {
  id: number
  type: DefectType
  status: DefectStatus
  urgency: number
  urgency_band: UrgencyBand
  urgency_terms: { type: number; size: number; location: number; age: number }
  lat: number
  lon: number
  first_seen: string
  last_seen: string
  sighting_count: number
  crop_url: string
  segment_id: number
  // Non-null exactly when an approved job covers the defect (decision 84).
  work_order_id: number | null
  // When the defect reached confirmed, or null (decision 83).
  confirmed_at: string | null
  location_reasons: LocationReason[]
}

// One sighting of a defect (decision 66).
export type Sighting = {
  id: number
  captured_at: string
  confidence: number
  crop_url: string
  device_id: string
}

// One status change of a defect (decision 86).
export type HistoryEntry = { status: DefectStatus; at: string }

// GET /defects/{id}: the defect object plus its sightings and its status
// history, oldest first (decisions 66 and 86).
export type DefectDetail = Defect & { sightings: Sighting[]; history: HistoryEntry[] }

// `bbox` for GET /defects: minLon, minLat, maxLon, maxLat.
export type Bbox = [number, number, number, number]

// Query for GET /defects (decisions 63 and 82). `bbox` is required. `status`
// is sent as a comma-separated list.
export type DefectsQuery = {
  bbox: Bbox
  type?: DefectType
  status?: DefectStatus[]
  sort?: "urgency_desc"
  limit?: number
}

// A failed call. `status` is the HTTP status (404, 409, 422 in v0), or 0 when
// the server could not be reached. `message` comes from FastAPI's `detail`.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export type WorkOrderStatus = "pending_approval" | "approved" | "rejected" | "done"

// Work order object (decision 70).
export type WorkOrder = {
  id: number
  status: WorkOrderStatus
  crew_type: string
  description: string
  defect_ids: number[]
  created_at: string
  approved_at: string | null
}

// Detection record, as the phone uploads it (api-contract.md).
export type DetectionRecord = {
  client_id: string
  device_id: string
  captured_at: string
  defect_type: DefectType
  confidence: number
  band: "save" | "review"
  bbox: [number, number, number, number]
  vehicle: { lat: number; lon: number; gps_accuracy_m: number; heading_deg: number; speed_kmh: number }
  distance_ahead_m: number
  defect_point: { lat: number; lon: number }
  model_version: string
  urgent: boolean
  crop_file: string
}

export type ReviewStatus = "pending" | "answered"

// GET /reviews item (decision 68): the detection record plus `crop_url`.
export type Review = {
  id: number
  status: ReviewStatus
  sighting: DetectionRecord & { crop_url: string }
}

// POST /reviews/{id} body (decision 69). `class` is required for wrong_class.
export type ReviewAnswer =
  | { answer: "correct" }
  | { answer: "not_defect" }
  | { answer: "wrong_class"; class: DefectType }

// PATCH /work-orders/{id} body (decision 71): any of these; left-out fields do not change.
export type WorkOrderChanges = Partial<Pick<WorkOrder, "description" | "crew_type" | "defect_ids">>

// GET /brief/latest (decision 74).
export type Brief = {
  id: number
  created_at: string
  text: string
  defect_ids: number[]
}
