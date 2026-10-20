import { createHash, timingSafeEqual } from "node:crypto"

// Checks the action code on the server. ACTION_CODE is a server-only env var
// (never NEXT_PUBLIC_), set in dashboard/.env.local or on the host. A speed
// bump against stray clicks, not security.
//
// POST only: GET handlers can be prerendered with Cache Components, which
// would freeze the env check at build time; POST runs on every request.
//
// Body { code: string } checks a code; { check: true } only asks whether
// actions are on. Answers: 200 { enabled: true, ok: boolean }, or 200
// { enabled: false } when ACTION_CODE is not set.

function sameCode(a: string, b: string): boolean {
  // Hash first so both sides have the same length for timingSafeEqual.
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

export async function POST(request: Request) {
  const expected = process.env.ACTION_CODE
  if (!expected) return Response.json({ enabled: false })

  let body: { code?: unknown; check?: unknown }
  try {
    body = (await request.json()) as { code?: unknown; check?: unknown }
  } catch {
    return Response.json({ detail: "Send JSON: { code }" }, { status: 422 })
  }
  if (body.check === true) return Response.json({ enabled: true })
  if (typeof body.code !== "string") return Response.json({ detail: "code must be a string" }, { status: 422 })
  return Response.json({ enabled: true, ok: sameCode(body.code, expected) })
}
