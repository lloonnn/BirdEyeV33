// Invented data for the prototype.
// Mock versions of the functions in lib/api.ts. Each takes the same
// parameters as the real endpoint and filters the same way.

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
import { mockLatencyMs } from "@/lib/config"
import { setStatus } from "@/lib/mocks/history"
import { malaysiaIso } from "@/lib/mocks/iso"
import { mergeSighting } from "@/lib/mocks/merge"
import { mockSightings } from "@/lib/mocks/sightings"
import { persist, store } from "@/lib/mocks/store"

type CallOptions = { signal?: AbortSignal }

// GET /defects limits (manager's decision, 15 Oct).
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000

function delay({ signal }: CallOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, mockLatencyMs)
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

// GET /defects: bbox, type, status (one or a list), sort, limit (decisions 63
// and 82). Sorted by urgency, highest first, by default; urgency_desc is the
// only sort. limit defaults to 500, and above 1000 fails with 422 (manager's
// decision, 15 Oct; the contract names no error, so 422 as for validation).
export async function getDefects(query: DefectsQuery, options: CallOptions): Promise<Defect[]> {
  await delay(options)
  const limit = query.limit ?? DEFAULT_LIMIT
  if (limit > MAX_LIMIT) throw new ApiError(422, `limit must be at most ${MAX_LIMIT}`)
  const [minLon, minLat, maxLon, maxLat] = query.bbox
  let result = store.defects.filter(
    (d) =>
      d.lon >= minLon &&
      d.lon <= maxLon &&
      d.lat >= minLat &&
      d.lat <= maxLat &&
      (!query.type || d.type === query.type) &&
      (!query.status?.length || query.status.includes(d.status))
  )
  if ((query.sort ?? "urgency_desc") === "urgency_desc") {
    result = [...result].sort((a, b) => b.urgency - a.urgency)
  }
  return structuredClone(result.slice(0, limit))
}

// GET /defects/{id}: the defect plus its sightings and status history, or 404
// in FastAPI's format (decisions 66, 79 and 86).
export async function getDefect(id: number, options: CallOptions): Promise<DefectDetail> {
  await delay(options)
  const defect = store.defects.find((d) => d.id === id)
  if (!defect) throw new ApiError(404, "Not Found")
  return structuredClone({ ...defect, sightings: mockSightings(defect), history: store.history[id] ?? [] })
}

// Testing aid: a failure set on `store.failNext` applies to the next action.
function takeForcedFailure() {
  const failure = store.failNext
  store.failNext = null
  if (failure) throw new ApiError(failure.status, failure.detail)
}

// POST /defects/{id}/verify (decision 67): no body; detected to verified;
// 409 from any other status; returns the updated defect.
export async function verifyDefect(id: number, options: CallOptions): Promise<Defect> {
  await delay(options)
  takeForcedFailure()
  const defect = store.defects.find((d) => d.id === id)
  if (!defect) throw new ApiError(404, "Not Found")
  if (defect.status !== "detected") {
    throw new ApiError(409, `Defect ${id} is ${defect.status}, not detected`)
  }
  setStatus(store.history, defect, "verified")
  persist()
  return structuredClone(defect)
}

// GET /work-orders?status= (decision 70).
export async function getWorkOrders(
  query: { status?: WorkOrderStatus },
  options: CallOptions
): Promise<WorkOrder[]> {
  await delay(options)
  return structuredClone(store.workOrders.filter((w) => !query.status || w.status === query.status))
}

// GET /work-orders/{id}: one work order, or 404 (decision 87).
export async function getWorkOrder(id: number, options: CallOptions): Promise<WorkOrder> {
  await delay(options)
  const order = store.workOrders.find((w) => w.id === id)
  if (!order) throw new ApiError(404, "Not Found")
  return structuredClone(order)
}

// POST /work-orders/{id}/done (decision 71): no body; approved to done, and
// its defects go to fixed; 409 from any other status; returns the work order.
export async function finishWorkOrder(id: number, options: CallOptions): Promise<WorkOrder> {
  await delay(options)
  takeForcedFailure()
  const order = store.workOrders.find((w) => w.id === id)
  if (!order) throw new ApiError(404, "Not Found")
  if (order.status !== "approved") {
    throw new ApiError(409, `Work order ${id} is ${order.status}, not approved`)
  }
  order.status = "done"
  for (const defect of store.defects) {
    if (order.defect_ids.includes(defect.id) && defect.status === "scheduled") setStatus(store.history, defect, "fixed")
  }
  persist()
  return structuredClone(order)
}

// GET /reviews?status= (decisions 68 and 88): pending when no status is sent.
export async function getReviews(query: { status?: ReviewStatus }, options: CallOptions): Promise<Review[]> {
  await delay(options)
  const status = query.status ?? "pending"
  return structuredClone(store.reviews.filter((r) => r.status === status))
}

// POST /reviews/{id} (decision 69). `correct` merges the sighting like a
// save-band record; `wrong_class` merges it with the class sent; `not_defect`
// keeps the crop as a negative example and changes no defect. 422 without
// `class` on wrong_class, 409 if already answered, 404 for an unknown ID.
export async function answerReview(id: number, body: ReviewAnswer, options: CallOptions): Promise<Review> {
  await delay(options)
  takeForcedFailure()
  const review = store.reviews.find((r) => r.id === id)
  if (!review) throw new ApiError(404, "Not Found")
  if (body.answer === "wrong_class" && !("class" in body && body.class)) {
    throw new ApiError(422, "class is required when answer is wrong_class")
  }
  if (review.status === "answered") throw new ApiError(409, `Review ${id} is already answered`)

  if (body.answer === "correct") mergeSighting(review.sighting, review.sighting.defect_type)
  else if (body.answer === "wrong_class") mergeSighting(review.sighting, body.class)
  else store.negativeExamples.push(review.sighting.client_id)

  review.status = "answered"
  persist()
  return structuredClone(review)
}

// POST /defects/{id}/reject (decision 67): no body; detected to rejected, and
// its crop becomes a negative training example; 409 from any other status;
// returns the updated defect.
export async function rejectDefect(id: number, options: CallOptions): Promise<Defect> {
  await delay(options)
  takeForcedFailure()
  const defect = store.defects.find((d) => d.id === id)
  if (!defect) throw new ApiError(404, "Not Found")
  if (defect.status !== "detected") {
    throw new ApiError(409, `Defect ${id} is ${defect.status}, not detected`)
  }
  setStatus(store.history, defect, "rejected")
  store.negativeExamples.push(defect.crop_url)
  persist()
  return structuredClone(defect)
}

// Work orders an action may change: approve, reject and PATCH from
// pending_approval only, done from approved only; otherwise 409 (decision 71).
function orderFor(id: number, allowed: WorkOrderStatus): WorkOrder {
  const order = store.workOrders.find((w) => w.id === id)
  if (!order) throw new ApiError(404, "Not Found")
  if (order.status !== allowed) throw new ApiError(409, `Work order ${id} is ${order.status}, not ${allowed}`)
  return order
}

// POST /work-orders/{id}/approve (decision 71): no body; pending_approval to
// approved, sets approved_at; its defects go to scheduled and point at the job.
export async function approveWorkOrder(id: number, options: CallOptions): Promise<WorkOrder> {
  await delay(options)
  takeForcedFailure()
  const order = orderFor(id, "pending_approval")
  // Check every cited defect first, so a bad selection changes nothing.
  const defects = order.defect_ids.map((defectId) => {
    const defect = store.defects.find((d) => d.id === defectId)
    if (!defect) throw new ApiError(409, `Defect ${defectId} does not exist`)
    if (defect.status !== "detected" && defect.status !== "verified") {
      throw new ApiError(409, `Defect ${defectId} is ${defect.status}, not detected or verified`)
    }
    if (defect.work_order_id !== null) {
      throw new ApiError(409, `Defect ${defectId} is already on work order ${defect.work_order_id}`)
    }
    return defect
  })
  order.status = "approved"
  order.approved_at = malaysiaIso(Date.now())
  for (const defect of defects) {
    setStatus(store.history, defect, "scheduled")
    defect.work_order_id = order.id
  }
  persist()
  return structuredClone(order)
}

// POST /work-orders/{id}/reject (decision 71): no body; pending_approval to
// rejected; its defects do not change.
export async function rejectWorkOrder(id: number, options: CallOptions): Promise<WorkOrder> {
  await delay(options)
  takeForcedFailure()
  const order = orderFor(id, "pending_approval")
  order.status = "rejected"
  persist()
  return structuredClone(order)
}

// PATCH /work-orders/{id} (decisions 71 and 89): any of description,
// crew_type, defect_ids; fields left out do not change; pending_approval only.
// defect_ids may only remove defects: an ID not on the job gives 422, an
// empty list 409.
export async function editWorkOrder(
  id: number,
  changes: WorkOrderChanges,
  options: CallOptions
): Promise<WorkOrder> {
  await delay(options)
  takeForcedFailure()
  const order = orderFor(id, "pending_approval")
  if (changes.defect_ids !== undefined) {
    const added = changes.defect_ids.find((defectId) => !order.defect_ids.includes(defectId))
    if (added !== undefined) throw new ApiError(422, `Defect ${added} is not on work order ${id}`)
    if (changes.defect_ids.length === 0) throw new ApiError(409, `Work order ${id} would have no defects`)
  }
  if (changes.description !== undefined) order.description = changes.description
  if (changes.crew_type !== undefined) order.crew_type = changes.crew_type
  if (changes.defect_ids !== undefined) order.defect_ids = [...changes.defect_ids]
  persist()
  return structuredClone(order)
}

// GET /brief/latest (decision 74): the latest brief, or 404 when none exists.
export async function getBrief(options: CallOptions): Promise<Brief> {
  await delay(options)
  if (!store.brief) throw new ApiError(404, "Not Found")
  return structuredClone(store.brief)
}
