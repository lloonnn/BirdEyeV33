// Invented data for the prototype.
// Mock versions of the functions in lib/api.ts. Each takes the same
// parameters as the real endpoint and filters the same way.

import type { Defect, DefectsQuery } from "@/lib/api-types"
import { mockLatencyMs } from "@/lib/config"
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
