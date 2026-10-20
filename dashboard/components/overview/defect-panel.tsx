"use client"

import { useEffect, useRef, useState } from "react"
import { CheckIcon, ChevronDownIcon, CopyIcon, Loader2Icon, XIcon } from "lucide-react"

import { UrgencyBadge } from "@/components/overview/badges"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { FinishJobDialog } from "@/components/overview/finish-job-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { guarded } from "@/lib/action-lock"
import { CropImage } from "@/components/crop-image"
import { cropSrc, finishWorkOrder, getDefect, rejectDefect, verifyDefect } from "@/lib/api"
import { ApiError, type Defect, type DefectDetail } from "@/lib/api-types"
import { cleanPassesToConfirm, whyTermMin } from "@/lib/config"
import { locationReasonName, statusLabel, typeName } from "@/lib/labels"
import { formatDay, formatWhen } from "@/lib/time"
import { cn } from "@/lib/utils"

type Props = {
  // The defect as the list returned it; shown at once while the detail loads.
  defect: Defect
  // Reference time for "12 min ago": when the data loaded.
  now: number
  // Changes after any action; the panel reloads the defect when it does.
  refreshKey: number
  // Ask the page to reload everything from the API after an action.
  onChanged: () => void
  // True while a dialog is open or an action runs, so the page holds its poll.
  onBusyChange?: (busy: boolean) => void
  // Defects already loaded, used to name a job's defects in the dialog.
  known: Defect[]
  onClose: () => void
  className?: string
}

// `key` is the refreshKey the detail was loaded for.
type DetailResult = { id: number; key: number; detail: DefectDetail | null; error: unknown }
type Notice = { tone: "info" | "error"; text: string }

const termLabels = [
  ["type", "Type"],
  ["size", "Size"],
  ["location", "Location"],
  ["age", "Age"],
] as const

type TermKey = (typeof termLabels)[number][0]

// Each urgency term as a few words, for "Why it ranks here". The type term
// names the defect's own type. The location term names its reasons from
// `location_reasons` (decision 85), and has no words when that list is empty.
function termWords(d: Defect, key: TermKey): string[] {
  switch (key) {
    case "type":
      return [typeName(d.type).toLowerCase()]
    case "size":
      return ["large"]
    case "location":
      return d.location_reasons.map(locationReasonName)
    case "age":
      return ["open a long time"]
  }
}

// What happens next for each status, and the one action if there is one.
function nextStep(d: Defect): string {
  switch (d.status) {
    case "detected":
      return "Seen once by the patrol phones. Check the photo, then verify or reject."
    case "verified":
      return "Real defect. Waiting for a work order."
    case "scheduled":
      return `In job ${d.work_order_id ?? "unknown"}. Mark fixed when the crew finishes.`
    case "fixed":
      return `Repaired. Confirmed after ${cleanPassesToConfirm} clean passes.`
    case "confirmed":
      return "Repair confirmed by later passes."
    case "rejected":
      return "Marked as not a defect."
  }
}

function detailError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return "This defect no longer exists."
  if (error instanceof ApiError && error.status !== 0) return `The server returned an error: ${error.message}`
  return "Can't reach the server."
}

// Errors from an action (brief section 7). A 409 means the defect or job
// changed elsewhere, so the panel reloads and says so.
function actionNotice(error: unknown): Notice {
  if (error instanceof ApiError && error.status === 409) {
    return { tone: "info", text: "This defect changed. Showing the latest." }
  }
  if (error instanceof ApiError && error.status !== 0) return { tone: "error", text: error.message }
  return { tone: "error", text: "Can't reach the server." }
}

const outlineButton =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm text-foreground hover:bg-white/10 disabled:opacity-60"

const primaryButton =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"

// Right panel: the selected defect. Title, next step and its one action,
// crop and why it ranks; the rest behind "Details". v0 has no street name.
export function DefectPanel({ defect, now, refreshKey, onChanged, onBusyChange, known, onClose, className }: Props) {
  const [result, setResult] = useState<DetailResult | null>(null)
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null)
  const [running, setRunning] = useState<"verify" | "finish" | "reject" | null>(null)
  // After an action, the refreshKey it ran under: progress shows until the
  // panel has reloaded the defect for a newer key.
  const [waitAfter, setWaitAfter] = useState<number | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirming, setConfirming] = useState(false)
  // The "Not a defect" dialog is open.
  const [rejecting, setRejecting] = useState(false)
  // True once that dialog closes by confirming, so it does not hand focus back.
  const rejectConfirmed = useRef(false)
  const rejectButtonRef = useRef<HTMLButtonElement>(null)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getDefect(defect.id, { signal: controller.signal })
      .then((detail) => setResult({ id: defect.id, key: refreshKey, detail, error: null }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ id: defect.id, key: refreshKey, detail: null, error })
      })
    return () => controller.abort()
  }, [defect.id, refreshKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc in a dialog closes only the dialog.
      if (e.key === "Escape" && !confirming && !rejecting) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, confirming, rejecting])

  const current = result?.id === defect.id ? result : null
  // Prefer the fresh detail; fall back to the list's copy.
  const d: Defect = current?.detail ?? defect
  const coords = `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`
  const crop = cropSrc(d.crop_url, "getDefect")
  const sightings = current?.detail
    ? [...current.detail.sightings].sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))
    : null
  // "Detected 12 Oct · Verified 13 Oct", oldest first (decision 86).
  const timeline = current?.detail?.history.map((h) => `${statusLabel[h.status]} ${formatDay(h.at)}`).join(" · ")
  // Terms at or above the threshold; if none give words, the highest term
  // that does, so there is always a reason.
  const strong = termLabels.filter(([key]) => d.urgency_terms[key] >= whyTermMin).flatMap(([key]) => termWords(d, key))
  const ranked = [...termLabels].sort(([a], [b]) => d.urgency_terms[b] - d.urgency_terms[a])
  const reasons = strong.length > 0 ? strong : (ranked.map(([key]) => termWords(d, key)).find((w) => w.length > 0) ?? [])
  const refreshing = waitAfter !== null && (current?.key ?? -1) <= waitAfter
  const busy = running !== null || refreshing
  const holding = busy || confirming || rejecting

  useEffect(() => {
    onBusyChange?.(holding)
  }, [onBusyChange, holding])

  // Closing the panel ends any hold.
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  // Runs one action, then reloads the panel, pins, list and numbers from the API.
  // A rejected defect leaves the map, so the panel closes after a reject.
  async function run(kind: "verify" | "finish" | "reject", action: () => Promise<unknown>) {
    setRunning(kind)
    setNotice(null)
    try {
      await action()
      setWaitAfter(refreshKey)
      onChanged()
      if (kind === "reject") onClose()
    } catch (error) {
      setNotice(actionNotice(error))
      if (error instanceof ApiError && error.status === 409) {
        setWaitAfter(refreshKey)
        onChanged()
      }
    } finally {
      setRunning(null)
      setConfirming(false)
    }
  }

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
    <aside aria-label={`Defect ${d.id}`} className={cn("panel flex flex-col overflow-hidden p-0", className)}>
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {typeName(d.type)}
            <UrgencyBadge band={d.urgency_band} />
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="tabular">#{d.id}</span> · {statusLabel[d.status]}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close (Esc)"
          className="rounded-full p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="flex flex-col gap-4 overflow-y-auto p-4 text-sm [color-scheme:dark] [scrollbar-width:thin]">
        <section aria-label="Next step" className="flex flex-col gap-3">
          <p>{nextStep(d)}</p>
          {d.status === "detected" && (
            <>
              <button type="button" disabled={busy} onClick={() => guarded(() => run("verify", () => verifyDefect(d.id)))} className={primaryButton}>
                {running === "verify" && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
                {running === "verify" || (busy && running === null) ? "Verifying…" : "Verify"}
              </button>
              <button
                ref={rejectButtonRef}
                type="button"
                disabled={busy}
                onClick={() =>
                  guarded(() => {
                    rejectConfirmed.current = false
                    setNotice(null)
                    setRejecting(true)
                  })
                }
                className={outlineButton}
              >
                {running === "reject" && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
                {running === "reject" ? "Rejecting…" : "Not a defect"}
              </button>
            </>
          )}
          {d.status === "scheduled" && d.work_order_id !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                guarded(() => {
                  setNotice(null)
                  setConfirming(true)
                })
              }
              className={primaryButton}
            >
              {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
              {busy ? "Marking fixed…" : "Mark fixed"}
            </button>
          )}
          {notice && (
            <p
              role={notice.tone === "error" ? "alert" : "status"}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs",
                notice.tone === "error" ? "border-status-high/50 text-foreground" : "border-white/10 text-muted-foreground"
              )}
            >
              {notice.text}
            </p>
          )}
        </section>

        <ConfirmDialog
          open={rejecting}
          title="Mark as not a defect? It leaves the map."
          cropSrc={crop}
          cropAlt={`Crop of defect ${d.id}`}
          description={
            <>
              {typeName(d.type)}, <span className="tabular">#{d.id}</span>. Its photo becomes an example of what is
              not a defect.
            </>
          }
          onConfirm={() => {
            rejectConfirmed.current = true
            setRejecting(false)
            void run("reject", () => rejectDefect(d.id))
          }}
          onCancel={() => setRejecting(false)}
          finalFocus={() => (rejectConfirmed.current ? false : (rejectButtonRef.current ?? true))}
        />

        {confirming && d.work_order_id !== null && (
          <FinishJobDialog
            workOrderId={d.work_order_id}
            known={known}
            busy={running === "finish"}
            onConfirm={() => {
              const id = d.work_order_id
              if (id !== null) void run("finish", () => finishWorkOrder(id))
            }}
            onCancel={() => setConfirming(false)}
          />
        )}

        <CropImage src={crop} alt={`Crop of defect ${d.id}`} className="rounded-xl" />

        {/* Only urgent defects need a reason; Low omits the line. */}
        {d.urgency_band !== "low" && (
        <section aria-label="Why it ranks here">
          <h3 className="mb-1.5 text-xs font-medium">Why it ranks here:</h3>
          <p className="text-muted-foreground">{reasons.join(", ")}</p>
        </section>
        )}

        <button
          type="button"
          aria-expanded={showDetails}
          aria-controls={`defect-${d.id}-details`}
          onClick={() => setShowDetails((open) => !open)}
          className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon className={cn("size-3.5 transition-transform", showDetails && "rotate-180")} />
          {showDetails ? "Hide details" : "Details"}
        </button>

        {showDetails && (
          <div id={`defect-${d.id}-details`} className="flex flex-col gap-4">
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
            </dl>

            <section aria-label="Urgency">
              <h3 className="mb-2 flex items-baseline justify-between text-xs font-medium">
                Urgency
                <span className="tabular text-muted-foreground">{d.urgency.toFixed(2)} of 1</span>
              </h3>
              {/* v0 sends the four terms (decision 64); each is 0 to 1, weighted equally. */}
              <ul className="flex flex-col gap-1.5">
                {termLabels.map(([key, label]) => (
                  <li key={key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
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

            <section aria-label="History" className="flex flex-col gap-1.5">
              {current?.error ? (
                <p className="text-xs text-muted-foreground" role="alert">
                  {detailError(current.error)}
                </p>
              ) : !sightings || timeline === undefined ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              ) : (
                <>
                  {timeline && <p className="text-xs">{timeline}</p>}
                  {sightings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Not seen yet.</p>
                  ) : (
                    // No vehicle or device names on the Overview.
                    <p className="text-xs">
                      Seen <span className="tabular">{sightings.length}</span> {sightings.length === 1 ? "time" : "times"},
                      last {formatWhen(sightings[0].captured_at, now)}
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </aside>
  )
}
