"use client"

import { useEffect, useRef, useState } from "react"
import { CloudOffIcon, Loader2Icon } from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { answerReview, cropSrc, getReviews } from "@/lib/api"
import { ApiError, type DefectType, type Review, type ReviewAnswer } from "@/lib/api-types"
import { defectTypes, typeName } from "@/lib/labels"
import { setLastUpdated } from "@/lib/last-updated"
import { setNavCount } from "@/lib/nav-counts"
import { formatClock, formatWhen } from "@/lib/time"
import { cn } from "@/lib/utils"

// `key` is the refreshKey the list was loaded for.
type Loaded = { key: number; reviews: Review[]; at: Date }
type Kind = ReviewAnswer["answer"]
type Notice = { reviewId: number; tone: "info" | "error"; text: string }
type Tab = "all" | DefectType
// The answer waiting for confirmation. `newType` is the class for wrong_class.
type Pending = { review: Review; kind: Kind; newType: DefectType | null }

function failureText(error: unknown, lastAt: Date | null): string {
  const head =
    error instanceof ApiError && error.status !== 0
      ? `The server returned an error: ${error.message}`
      : "Can't reach the server."
  return lastAt ? `${head} Showing the last data from ${formatClock(lastAt)}.` : head
}

// Errors from an answer, as on the Overview. A 409 means someone answered it
// already, so the queue reloads and says so.
function answerNotice(reviewId: number, error: unknown): Notice {
  if (error instanceof ApiError && error.status === 409) {
    return { reviewId, tone: "info", text: "This review was already answered. Showing the latest." }
  }
  if (error instanceof ApiError && error.status !== 0) return { reviewId, tone: "error", text: error.message }
  return { reviewId, tone: "error", text: "Can't reach the server." }
}

// The types a "Wrong type" answer can change to.
function otherTypes(review: Review): DefectType[] {
  return defectTypes.filter((t) => t !== review.sighting.defect_type)
}

// The body for each answer (decision 69).
function answerBody(p: Pending): ReviewAnswer {
  if (p.kind === "wrong_class" && p.newType) return { answer: "wrong_class", class: p.newType }
  if (p.kind === "wrong_class") throw new Error("wrong_class needs a type")
  return { answer: p.kind }
}

// The question the dialog asks, in words.
function question(p: Pending): string {
  if (p.kind === "correct") return `Mark as a real ${typeName(p.review.sighting.defect_type).toLowerCase()}?`
  if (p.kind === "not_defect") return "Mark as not a defect?"
  return p.newType ? `Change to ${typeName(p.newType)}?` : "Change to which type?"
}

const answers: { kind: Kind; label: string; key: string }[] = [
  { kind: "correct", label: "Yes, defect", key: "Y" },
  { kind: "wrong_class", label: "Wrong type", key: "T" },
  { kind: "not_defect", label: "Not a defect", key: "N" },
]

function CropBox({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return src ? (
    // The backend's crop host is not known at build time, so next/image cannot be configured for it.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={cn("aspect-video w-full rounded-md object-cover", className)} />
  ) : (
    <div
      className={cn(
        "flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border bg-muted text-xs text-muted-foreground",
        className
      )}
    >
      Invented crop
    </div>
  )
}

// Review page (brief section 5.2): unsure detections waiting for a supervisor.
// Working page: solid cards, no glass. No device names. Tabs by type guess;
// cards by confidence, highest first. Keyboard: arrows move between cards in
// the visible tab; Y, T and N open the confirmation for the focused card.
export function ReviewQueue() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<Tab>("all")
  const [activeId, setActiveId] = useState<number | null>(null)
  const [running, setRunning] = useState<{ reviewId: number; kind: Kind } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirming, setConfirming] = useState<Pending | null>(null)
  const cardRefs = useRef(new Map<number, HTMLLIElement>())
  // True once the dialog closes by confirming, so it does not hand focus back.
  const confirmedRef = useRef(false)
  // After an answer: the position in the visible tab to focus, once a list
  // loaded after refreshKey `after` arrives.
  const focusAfterReload = useRef<{ index: number; after: number } | null>(null)
  const emptyRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    getReviews({ signal: controller.signal })
      .then((reviews) => {
        const at = new Date()
        setLoaded({ key: refreshKey, reviews, at })
        setError(null)
        setLastUpdated(at)
        setNavCount("review", reviews.filter((r) => r.status === "pending").length)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err)
      })
    return () => controller.abort()
  }, [refreshKey])

  // v0 returns answered reviews too and has no filter: the page keeps the
  // pending ones, splits them by type guess and sorts by confidence.
  const pending = loaded?.reviews.filter((r) => r.status === "pending") ?? null
  const visibleOf = (list: Review[], t: Tab) =>
    list.filter((r) => t === "all" || r.sighting.defect_type === t).sort((a, b) => b.sighting.confidence - a.sighting.confidence)
  const visible = pending ? visibleOf(pending, tab) : null
  const now = loaded?.at.getTime() ?? 0
  const focusedId = visible?.some((r) => r.id === activeId) ? activeId : (visible?.[0]?.id ?? null)

  // Move focus to the next card once the reload after an answer arrives, or
  // to the empty message when the tab is clear.
  useEffect(() => {
    const target = focusAfterReload.current
    if (!target || !loaded || loaded.key <= target.after) return
    focusAfterReload.current = null
    const left = visibleOf(loaded.reviews.filter((r) => r.status === "pending"), tab)
    const next = left[Math.min(target.index, left.length - 1)]
    if (next) cardRefs.current.get(next.id)?.focus()
    else emptyRef.current?.focus()
    // `tab` is read at reload time on purpose; changing tabs moves no focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  function ask(review: Review, kind: Kind) {
    if (running) return
    const others = otherTypes(review)
    // With two types, Wrong type means the other one; with more, the dialog asks.
    const newType = kind === "wrong_class" && others.length === 1 ? others[0] : null
    confirmedRef.current = false
    setNotice(null)
    setConfirming({ review, kind, newType })
  }

  async function send(p: Pending) {
    const index = visible?.findIndex((r) => r.id === p.review.id) ?? 0
    setRunning({ reviewId: p.review.id, kind: p.kind })
    try {
      await answerReview(p.review.id, answerBody(p))
      focusAfterReload.current = { index, after: refreshKey }
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setNotice(answerNotice(p.review.id, err))
      if (err instanceof ApiError && err.status === 409) {
        focusAfterReload.current = { index, after: refreshKey }
        setRefreshKey((k) => k + 1)
      } else {
        cardRefs.current.get(p.review.id)?.focus()
      }
    } finally {
      setRunning(null)
    }
  }

  function confirm() {
    if (!confirming || (confirming.kind === "wrong_class" && !confirming.newType)) return
    const p = confirming
    confirmedRef.current = true
    setConfirming(null)
    void send(p)
  }

  function onCardKey(e: React.KeyboardEvent<HTMLLIElement>, review: Review, index: number) {
    if (!visible || e.altKey || e.ctrlKey || e.metaKey) return
    const shortcut = answers.find((a) => a.key.toLowerCase() === e.key.toLowerCase())
    if (shortcut) {
      e.preventDefault()
      ask(review, shortcut.kind)
      return
    }
    // Columns in the grid: the cards on the first row.
    const tops = visible.map((r) => cardRefs.current.get(r.id)?.offsetTop ?? 0)
    const columns = Math.max(1, tops.filter((t) => t === tops[0]).length)
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[e.key]
    if (step === undefined) return
    e.preventDefault()
    const target = visible[Math.min(visible.length - 1, Math.max(0, index + step))]
    cardRefs.current.get(target.id)?.focus()
  }

  const counts: Record<Tab, number> | null = pending
    ? {
        all: pending.length,
        ...(Object.fromEntries(
          defectTypes.map((t) => [t, pending.filter((r) => r.sighting.defect_type === t).length])
        ) as Record<DefectType, number>),
      }
    : null

  return (
    <div className="flex flex-col gap-4 px-4 pt-19 pb-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {pending ? (
            <>
              <span className="tabular">{pending.length}</span> waiting
            </>
          ) : (
            "Review"
          )}
        </h1>
        <p className="text-sm text-muted-foreground">Your answers train the next model.</p>
      </header>

      {error !== null && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <CloudOffIcon className="size-4 text-status-high" aria-hidden />
          {failureText(error, loaded?.at ?? null)}
        </div>
      )}

      {/* Answer messages sit here, not on the card: after a 409 the card leaves. */}
      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg border bg-card px-3 py-2 text-sm",
            notice.tone === "error" ? "border-status-high/50" : "border-border text-muted-foreground"
          )}
        >
          Review <span className="tabular">#{notice.reviewId}</span>: {notice.text}
        </p>
      )}

      {counts && (
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList aria-label="Type guess">
            <TabsTrigger value="all">
              All <span className="tabular">{counts.all}</span>
            </TabsTrigger>
            {defectTypes.map((t) => (
              <TabsTrigger key={t} value={t}>
                {typeName(t)}? <span className="tabular">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {!visible && error === null ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4" aria-label="Loading reviews">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="rounded-lg border border-border bg-card p-3">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="mt-3 h-4 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </li>
          ))}
        </ul>
      ) : visible && visible.length === 0 ? (
        <p ref={emptyRef} tabIndex={-1} className="py-16 text-center text-muted-foreground outline-none">
          Nothing to review.
        </p>
      ) : visible ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4" aria-label="Reviews waiting">
          {visible.map((review, index) => {
            const s = review.sighting
            const busy = running?.reviewId === review.id
            return (
              <li
                key={review.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(review.id, el)
                  else cardRefs.current.delete(review.id)
                }}
                tabIndex={review.id === focusedId ? 0 : -1}
                aria-label={`${typeName(s.defect_type)}, confidence ${Math.round(s.confidence * 100)}%. Keys: Y yes, T wrong type, N not a defect.`}
                onFocus={() => setActiveId(review.id)}
                onKeyDown={(e) => onCardKey(e, review, index)}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <CropBox src={cropSrc(s.crop_url, "getReviews")} alt={`Crop for review ${review.id}`} />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{typeName(s.defect_type)}?</span>
                  <span className="text-xs text-muted-foreground">
                    confidence <span className="tabular text-foreground">{Math.round(s.confidence * 100)}%</span>
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Location</dt>
                  <dd className="tabular">
                    {s.defect_point.lat.toFixed(5)}, {s.defect_point.lon.toFixed(5)}
                  </dd>
                  <dt className="text-muted-foreground">Seen</dt>
                  <dd>{formatWhen(s.captured_at, now)}</dd>
                </dl>

                <div className="grid grid-cols-3 gap-1.5">
                  {answers.map((a) => (
                    <button
                      key={a.kind}
                      type="button"
                      disabled={running !== null}
                      onClick={() => ask(review, a.kind)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded-md border border-border px-1.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50",
                        a.kind === "correct" && "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
                      )}
                    >
                      <span className="flex items-center gap-1">
                        {busy && running?.kind === a.kind && <Loader2Icon className="size-3 animate-spin" aria-hidden />}
                        {a.label}
                      </span>
                      <kbd className="tabular text-[10px] opacity-60">{a.key}</kbd>
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? question(confirming) : ""}
        cropSrc={confirming ? cropSrc(confirming.review.sighting.crop_url, "getReviews") : null}
        cropAlt="Crop being answered"
        description={
          confirming && (
            <>
              Type guess: {typeName(confirming.review.sighting.defect_type)}, confidence{" "}
              <span className="tabular">{Math.round(confirming.review.sighting.confidence * 100)}%</span>
            </>
          )
        }
        confirmDisabled={confirming?.kind === "wrong_class" && !confirming.newType}
        onConfirm={confirm}
        onCancel={() => setConfirming(null)}
        // Cancel hands focus back to the same card; confirm moves it to the next card after the reload.
        finalFocus={() =>
          confirmedRef.current || !confirming ? false : (cardRefs.current.get(confirming.review.id) ?? true)
        }
      >
        {/* More than two types: Wrong type asks which one. */}
        {confirming?.kind === "wrong_class" && otherTypes(confirming.review).length > 1 && (
          <fieldset className="flex flex-col gap-1.5 text-sm">
            <legend className="mb-1 text-muted-foreground">Change to</legend>
            {otherTypes(confirming.review).map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="new-type"
                  checked={confirming.newType === t}
                  onChange={() => setConfirming({ ...confirming, newType: t })}
                />
                {typeName(t)}
              </label>
            ))}
          </fieldset>
        )}
      </ConfirmDialog>
    </div>
  )
}
