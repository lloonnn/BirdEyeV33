// Every backend call goes through this file (Rule 1). `NEXT_PUBLIC_API_MODE`
// and the live list below decide, per function, whether it calls the backend
// or its mock (Rule 3). Nothing else switches.

import {
  ApiError,
  type Defect,
  type DefectDetail,
  type DefectsQuery,
  type Review,
  type ReviewAnswer,
  type WorkOrder,
  type WorkOrderStatus,
} from "@/lib/api-types"
import * as mock from "@/lib/mocks/api"

type ApiFunction =
  | "getDefects"
  | "getDefect"
  | "verifyDefect"
  | "rejectDefect"
  | "getWorkOrders"
  | "finishWorkOrder"
  | "getReviews"
  | "answerReview"

// Functions whose backend endpoint works. Used only when the mode is `real`.
// Empty until the backend serves GET /defects and GET /defects/{id}; add both
// together, since the panel looks up IDs that the map list returns.
const live: ReadonlySet<ApiFunction> = new Set<ApiFunction>([])

const mode = process.env.NEXT_PUBLIC_API_MODE === "real" ? "real" : "mock"
const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")

// True when this function returns invented data, so the page shows the
// mock banner.
export function usesMock(fn: ApiFunction): boolean {
  return mode !== "real" || !live.has(fn)
}

type CallOptions = { signal?: AbortSignal }

// GET /defects (decisions 63 and 64).
export async function getDefects(
  query: DefectsQuery,
  options: CallOptions = {}
): Promise<Defect[]> {
  if (usesMock("getDefects")) return mock.getDefects(query, options)

  const params = new URLSearchParams({ bbox: query.bbox.join(",") })
  if (query.type) params.set("type", query.type)
  if (query.status) params.set("status", query.status)
  if (query.sort) params.set("sort", query.sort)
  if (query.limit !== undefined) params.set("limit", String(query.limit))
  return request<Defect[]>(`/defects?${params}`, options)
}

// GET /defects/{id}: the defect plus its sightings, or 404 (decision 66).
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

// POST /work-orders/{id}/done: the job goes from approved to done and all its
// defects to fixed; no body; returns the updated work order; 409 if the job is
// not approved (decision 71).
export async function finishWorkOrder(id: number, options: CallOptions = {}): Promise<WorkOrder> {
  if (usesMock("finishWorkOrder")) return mock.finishWorkOrder(id, options)
  return request<WorkOrder>(`/work-orders/${id}/done`, { ...options, method: "POST" })
}

// GET /reviews: every review, pending and answered (decision 68). v0 has no
// status filter, so pages pick the pending ones.
export async function getReviews(options: CallOptions = {}): Promise<Review[]> {
  if (usesMock("getReviews")) return mock.getReviews(options)
  return request<Review[]>("/reviews", options)
}

// POST /reviews/{id}: the supervisor's answer (decision 69). Returns the
// updated review; 409 if already answered; 422 if wrong_class has no class.
export async function answerReview(id: number, body: ReviewAnswer, options: CallOptions = {}): Promise<Review> {
  if (usesMock("answerReview")) return mock.answerReview(id, body, options)
  return request<Review>(`/reviews/${id}`, { ...options, method: "POST", body })
}

// Where to load a crop from, or null when the crop is invented (mock mode
// shows a placeholder instead). The backend serves `crop_url`; its path is
// not fixed in v0, so a relative path is taken against the backend address.
export function cropSrc(cropUrl: string, fn: ApiFunction): string | null {
  if (usesMock(fn)) return null
  return /^https?:\/\//.test(cropUrl) ? cropUrl : `${baseUrl}${cropUrl}`
}

async function request<T>(
  path: string,
  { signal, method = "GET", body }: CallOptions & { method?: "GET" | "POST"; body?: unknown }
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
