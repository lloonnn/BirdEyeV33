// Every backend call goes through this file (Rule 1). `NEXT_PUBLIC_API_MODE`
// and the live list below decide, per function, whether it calls the backend
// or its mock (Rule 3). Nothing else switches.

import {
  ApiError,
  type Defect,
  type DefectDetail,
  type DefectsQuery,
  type Brief,
  type Review,
  type ReviewAnswer,
  type ReviewStatus,
  type WorkOrder,
  type WorkOrderChanges,
  type WorkOrderStatus,
} from "@/lib/api-types"
import * as mock from "@/lib/mocks/api"
import { clearSaved } from "@/lib/mocks/store"

type ApiFunction =
  | "getDefects"
  | "getDefect"
  | "verifyDefect"
  | "rejectDefect"
  | "getWorkOrders"
  | "getWorkOrder"
  | "finishWorkOrder"
  | "approveWorkOrder"
  | "rejectWorkOrder"
  | "editWorkOrder"
  | "getBrief"
  | "getReviews"
  | "answerReview"

// Functions whose backend endpoint works. Used only when the mode is `real`.
// Defects are live; add both reads together, since the panel looks up IDs that
// the map list returns.
const live: ReadonlySet<ApiFunction> = new Set<ApiFunction>([
  "getDefects",
  "getDefect",
  "verifyDefect",
  "rejectDefect",
  "getWorkOrders",
  "getWorkOrder",
  "finishWorkOrder",
  "approveWorkOrder",
  "rejectWorkOrder",
  "editWorkOrder",
  "getBrief",
  "getReviews",
  "answerReview",
])

const mode = process.env.NEXT_PUBLIC_API_MODE === "real" ? "real" : "mock"

// True in mock mode: the pages may offer "Reset mock data".
export const inMockMode = mode === "mock"
const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")

// True when this function returns invented data, so the page shows the
// mock banner.
export function usesMock(fn: ApiFunction): boolean {
  return mode !== "real" || !live.has(fn)
}

// How much of the API is invented right now: "all" mock, "some" mock (the
// status pill says "Partly mock data"), or "none" (no label).
const allFunctions: readonly ApiFunction[] = [
  "getDefects",
  "getDefect",
  "verifyDefect",
  "rejectDefect",
  "getWorkOrders",
  "getWorkOrder",
  "finishWorkOrder",
  "approveWorkOrder",
  "rejectWorkOrder",
  "editWorkOrder",
  "getBrief",
  "getReviews",
  "answerReview",
]
export function mockCoverage(): "all" | "some" | "none" {
  const mocked = allFunctions.filter(usesMock).length
  if (mocked === 0) return "none"
  return mocked === allFunctions.length ? "all" : "some"
}

type CallOptions = { signal?: AbortSignal }

// GET /defects (decisions 63, 64 and 82).
export async function getDefects(
  query: DefectsQuery,
  options: CallOptions = {}
): Promise<Defect[]> {
  if (usesMock("getDefects")) return mock.getDefects(query, options)

  const params = new URLSearchParams({ bbox: query.bbox.join(",") })
  if (query.type) params.set("type", query.type)
  if (query.status?.length) params.set("status", query.status.join(","))
  if (query.sort) params.set("sort", query.sort)
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  return request<Defect[]>(`/defects?${params}`, options)
}

// GET /defects/{id}: the defect plus its sightings and status history, or 404
// (decisions 66 and 86).
export async function getDefect(id: number, options: CallOptions = {}): Promise<DefectDetail> {
  if (usesMock("getDefect")) return mock.getDefect(id, options)
  return request<DefectDetail>(`/defects/${id}`, options)
}

// POST /defects/{id}/verify: detected to verified; no body; returns the
// updated defect; 409 if it is no longer detected (decision 67).
export async function verifyDefect(id: number, options: CallOptions = {}): Promise<Defect> {
  if (usesMock("verifyDefect")) return mock.verifyDefect(id, options)
  return request<Defect>(`/defects/${id}/verify`, { ...options, method: "POST" })
}

// POST /defects/{id}/reject: detected to rejected, and its crop becomes a
// negative training example; no body; returns the updated defect; 409 if it
// is no longer detected (decision 67).
export async function rejectDefect(id: number, options: CallOptions = {}): Promise<Defect> {
  if (usesMock("rejectDefect")) return mock.rejectDefect(id, options)
  return request<Defect>(`/defects/${id}/reject`, { ...options, method: "POST" })
}

// GET /work-orders, optionally for one status (decision 70).
export async function getWorkOrders(
  query: { status?: WorkOrderStatus } = {},
  options: CallOptions = {}
): Promise<WorkOrder[]> {
  if (usesMock("getWorkOrders")) return mock.getWorkOrders(query, options)
  const params = query.status ? `?${new URLSearchParams({ status: query.status })}` : ""
  return request<WorkOrder[]>(`/work-orders${params}`, options)
}

// GET /work-orders/{id}: one work order, or 404 (decision 87).
export async function getWorkOrder(id: number, options: CallOptions = {}): Promise<WorkOrder> {
  if (usesMock("getWorkOrder")) return mock.getWorkOrder(id, options)
  return request<WorkOrder>(`/work-orders/${id}`, options)
}

// POST /work-orders/{id}/done: the job goes from approved to done and all its
// defects to fixed; no body; returns the updated work order; 409 if the job is
// not approved (decision 71).
export async function finishWorkOrder(id: number, options: CallOptions = {}): Promise<WorkOrder> {
  if (usesMock("finishWorkOrder")) return mock.finishWorkOrder(id, options)
  return request<WorkOrder>(`/work-orders/${id}/done`, { ...options, method: "POST" })
}

// GET /reviews, optionally for one status; the backend's default is pending
// (decisions 68 and 88).
export async function getReviews(
  query: { status?: ReviewStatus } = {},
  options: CallOptions = {}
): Promise<Review[]> {
  if (usesMock("getReviews")) return mock.getReviews(query, options)
  const params = query.status ? `?${new URLSearchParams({ status: query.status })}` : ""
  return request<Review[]>(`/reviews${params}`, options)
}

// POST /reviews/{id}: the supervisor's answer (decision 69). Returns the
// updated review; 409 if already answered; 422 if wrong_class has no class.
export async function answerReview(id: number, body: ReviewAnswer, options: CallOptions = {}): Promise<Review> {
  if (usesMock("answerReview")) return mock.answerReview(id, body, options)
  return request<Review>(`/reviews/${id}`, { ...options, method: "POST", body })
}

// POST /work-orders/{id}/approve: pending_approval to approved; its defects go
// to scheduled; no body; returns the updated work order; 409 otherwise (decision 71).
export async function approveWorkOrder(id: number, options: CallOptions = {}): Promise<WorkOrder> {
  if (usesMock("approveWorkOrder")) return mock.approveWorkOrder(id, options)
  return request<WorkOrder>(`/work-orders/${id}/approve`, { ...options, method: "POST" })
}

// POST /work-orders/{id}/reject: pending_approval to rejected; its defects do
// not change; no body; returns the updated work order; 409 otherwise (decision 71).
export async function rejectWorkOrder(id: number, options: CallOptions = {}): Promise<WorkOrder> {
  if (usesMock("rejectWorkOrder")) return mock.rejectWorkOrder(id, options)
  return request<WorkOrder>(`/work-orders/${id}/reject`, { ...options, method: "POST" })
}

// PATCH /work-orders/{id}: edit a draft's description, crew_type or
// defect_ids; pending_approval only; returns the updated work order (decision
// 71). defect_ids may only remove defects: an added ID gives 422 and an empty
// list 409 (decision 89).
export async function editWorkOrder(id: number, changes: WorkOrderChanges, options: CallOptions = {}): Promise<WorkOrder> {
  if (usesMock("editWorkOrder")) return mock.editWorkOrder(id, changes, options)
  return request<WorkOrder>(`/work-orders/${id}`, { ...options, method: "PATCH", body: changes })
}

// GET /brief/latest: the latest daily brief (decision 74). A 404 means no
// brief exists yet, so this returns null rather than failing.
export async function getBrief(options: CallOptions = {}): Promise<Brief | null> {
  try {
    if (usesMock("getBrief")) return await mock.getBrief(options)
    return await request<Brief>("/brief/latest", options)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

// Mock mode only: forget saved mock changes. The caller reloads the page so
// every view starts again from the seed data.
export function resetMockData() {
  if (inMockMode) clearSaved()
}

// Where to load a crop from, or null for the placeholder. Mock data points at
// sample photos in public/mock-crops/, served by the dashboard itself; any
// other mock crop is null. The backend serves `crop_url`; its path is not
// fixed in v0, so a relative path is taken against the backend address.
export function cropSrc(cropUrl: string, fn: ApiFunction): string | null {
  if (usesMock(fn)) return cropUrl.startsWith("/mock-crops/") ? cropUrl : null
  return /^https?:\/\//.test(cropUrl) ? cropUrl : `${baseUrl}${cropUrl}`
}

async function request<T>(
  path: string,
  { signal, method = "GET", body }: CallOptions & { method?: "GET" | "POST" | "PATCH"; body?: unknown }
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      signal,
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiError(0, "Can't reach the server.")
  }
  if (!res.ok) throw new ApiError(res.status, await errorDetail(res))
  return (await res.json()) as T
}

// FastAPI's `{"detail": ...}` (decision 79): a string for 404 and 409, a list
// of validation errors for 422.
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown }
    if (typeof body.detail === "string") return body.detail
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const first = body.detail[0] as { msg?: unknown }
      if (typeof first?.msg === "string") return first.msg
    }
  } catch {
    // Not JSON; fall through to the status text.
  }
  return res.statusText || `Request failed (${res.status})`
}
