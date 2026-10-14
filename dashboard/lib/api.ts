// Every backend call goes through this file (Rule 1). `NEXT_PUBLIC_API_MODE`
// and the live list below decide, per function, whether it calls the backend
// or its mock (Rule 3). Nothing else switches.

import { ApiError, type Defect, type DefectsQuery } from "@/lib/api-types"
import * as mock from "@/lib/mocks/api"

type ApiFunction = "getDefects"

// Functions whose backend endpoint works. Used only when the mode is `real`.
const live: ReadonlySet<ApiFunction> = new Set<ApiFunction>(["getDefects"])

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

async function request<T>(path: string, { signal }: CallOptions): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, { signal })
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
