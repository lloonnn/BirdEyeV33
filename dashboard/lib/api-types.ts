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

// Defect object (decision 64).
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
  work_order_id: number | null
}

// One sighting of a defect (decision 66).
export type Sighting = {
  id: number
  captured_at: string
  confidence: number
  crop_url: string
  device_id: string
}

// GET /defects/{id}: the defect object plus its sightings (decision 66).
export type DefectDetail = Defect & { sightings: Sighting[] }

// `bbox` for GET /defects and GET /coverage: minLon, minLat, maxLon, maxLat.
export type Bbox = [number, number, number, number]

// Query for GET /defects (decision 63). `bbox` is required.
export type DefectsQuery = {
  bbox: Bbox
  type?: DefectType
  status?: DefectStatus
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
