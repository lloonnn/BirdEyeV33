"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon, XIcon } from "lucide-react"

import { StatusBadge, TypeBadge, UrgencyBadge } from "@/components/overview/badges"
import { Skeleton } from "@/components/ui/skeleton"
import { cropSrc, getDefect } from "@/lib/api"
import { ApiError, type Defect, type DefectDetail } from "@/lib/api-types"
import { formatWhen } from "@/lib/time"
import { cn } from "@/lib/utils"

type Props = {
  // The defect as the list returned it; shown at once while the detail loads.
  defect: Defect
  // Reference time for "12 min ago": when the data loaded.
  now: number
  onClose: () => void
  className?: string
}

type DetailResult = { id: number; detail: DefectDetail | null; error: unknown }

const termLabels = [
  ["type", "Type"],
  ["size", "Size"],
  ["location", "Location"],
  ["age", "Age"],
] as const

function detailError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return "This defect no longer exists."
  if (error instanceof ApiError && error.status !== 0) return `The server returned an error: ${error.message}`
  return "Can't reach the server."
}

// Right panel: the selected defect (brief section 5.1). No actions until Phase 4.
export function DefectPanel({ defect, now, onClose, className }: Props) {
  const [result, setResult] = useState<DetailResult | null>(null)
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getDefect(defect.id, { signal: controller.signal })
      .then((detail) => setResult({ id: defect.id, detail, error: null }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ id: defect.id, detail: null, error })
      })
    return () => controller.abort()
  }, [defect.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const current = result?.id === defect.id ? result : null
  // Prefer the fresh detail; fall back to the list's copy.
  const d: Defect = current?.detail ?? defect
  const coords = `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`
  const crop = cropSrc(d.crop_url, "getDefect")
  const sightings = current?.detail
    ? [...current.detail.sightings].sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))
    : null

  async function copyCoords() {
    try {
      await navigator.clipboard.writeText(coords)
      setCopied("yes")
    } catch {
      setCopied("failed")
    }
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <aside
      aria-label={`Defect ${d.id}`}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg",
        className
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          Defect <span className="tabular">#{d.id}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close (Esc)"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-4 overflow-y-auto p-4 text-sm [color-scheme:dark] [scrollbar-width:thin]">
        {crop ? (
          // The backend's crop host is not known at build time, so next/image cannot be configured for it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={crop} alt={`Crop of defect ${d.id}`} className="aspect-video w-full rounded-md object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border bg-muted text-xs text-muted-foreground">
            Invented crop
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <TypeBadge type={d.type} />
          <UrgencyBadge band={d.urgency_band} />
          <StatusBadge defect={d} />
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Location</dt>
          <dd className="flex items-center gap-1.5">
            <span className="tabular">{coords}</span>
            <button
              type="button"
              onClick={copyCoords}
              aria-label="Copy coordinates"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              {copied === "yes" ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            </button>
            {copied && (
              <span className="text-muted-foreground" role="status">
                {copied === "yes" ? "Copied" : "Copy failed"}
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">First seen</dt>
          <dd>{formatWhen(d.first_seen, now)}</dd>
          <dt className="text-muted-foreground">Last seen</dt>
          <dd>{formatWhen(d.last_seen, now)}</dd>
          <dt className="text-muted-foreground">Sightings</dt>
          <dd className="tabular">{d.sighting_count}</dd>
          {d.work_order_id !== null && (
            <>
              <dt className="text-muted-foreground">Work order</dt>
              <dd className="tabular">#{d.work_order_id}</dd>
            </>
          )}
        </dl>

        <section>
          <h3 className="mb-2 flex items-baseline justify-between text-xs font-medium">
            Urgency
            <span className="tabular text-muted-foreground">{d.urgency.toFixed(2)} of 1</span>
          </h3>
          {/* v0 sends the four terms (decision 64); each is 0 to 1, weighted equally. */}
          <ul className="flex flex-col gap-1.5">
            {termLabels.map(([key, label]) => (
              <li key={key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-foreground/60"
                    style={{ width: `${d.urgency_terms[key] * 100}%` }}
                  />
                </span>
                <span className="tabular text-right">{d.urgency_terms[key].toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-medium">History</h3>
          {current?.error ? (
            <p className="text-xs text-muted-foreground" role="alert">
              {detailError(current.error)}
            </p>
          ) : !sightings ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : sightings.length === 0 ? (
            <p className="text-xs text-muted-foreground">No sightings recorded.</p>
          ) : (
            <ol className="flex flex-col gap-1.5 text-xs">
              {sightings.map((s) => (
                <li key={s.id} className="grid grid-cols-[1fr_auto_auto] gap-3">
                  <span>Seen by <span className="tabular">{s.device_id}</span></span>
                  <span className="tabular text-muted-foreground">{Math.round(s.confidence * 100)}%</span>
                  <span className="text-muted-foreground">{formatWhen(s.captured_at, now)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </aside>
  )
}
