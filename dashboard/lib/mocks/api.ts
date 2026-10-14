// Invented data for the prototype.
// Mock versions of the functions in lib/api.ts. Each takes the same
// parameters as the real endpoint and filters the same way.

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
import { mockLatencyMs } from "@/lib/config"
import { mergeSighting } from "@/lib/mocks/merge"
import { mockSightings } from "@/lib/mocks/sightings"
import { store } from "@/lib/mocks/store"

type CallOptions = { signal?: AbortSignal }

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

// GET /defects: bbox, type, status, sort=urgency_desc, limit (decision 63).
export async function getDefects(query: DefectsQuery, options: CallOptions): Promise<Defect[]> {
  await delay(options)
  const [minLon, minLat, maxLon, maxLat] = query.bbox
  let result = store.defects.filter(
    (d) =>
      d.lon >= minLon &&
      d.lon <= maxLon &&
      d.lat >= minLat &&
      d.lat <= maxLat &&
      (!query.type || d.type === query.type) &&
      (!query.status || d.status === query.status)
  )
  if (query.sort === "urgency_desc") {
    result = [...result].sort((a, b) => b.urgency - a.urgency)
  }
  if (query.limit !== undefined) result = result.slice(0, query.limit)
  return structuredClone(result)
}

// GET /defects/{id}: the defect plus its sightings, or 404 in FastAPI's
// format (decisions 66 and 79).
export async function getDefect(id: number, options: CallOptions): Promise<DefectDetail> {
  await delay(options)
  const defect = store.defects.find((d) => d.id === id)
  if (!defect) throw new ApiError(404, "Not Found")
  return structuredClone({ ...defect, sightings: mockSightings(defect) })
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
  defect.status = "verified"
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
    if (order.defect_ids.includes(defect.id) && defect.status === "scheduled") defect.status = "fixed"
  }
  return structuredClone(order)
}

// GET /reviews (decision 68): every review, pending and answered.
export async function getReviews(options: CallOptions): Promise<Review[]> {
  await delay(options)
  return structuredClone(store.reviews)
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
  defect.status = "rejected"
  store.negativeExamples.push(defect.crop_url)
  return structuredClone(defect)
}
