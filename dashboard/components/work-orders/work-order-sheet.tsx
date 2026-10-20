"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Loader2Icon } from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { UrgencyBadge } from "@/components/overview/badges"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { guarded } from "@/lib/action-lock"
import { approveWorkOrder, editWorkOrder, finishWorkOrder, getWorkOrder, rejectWorkOrder } from "@/lib/api"
import { ApiError, type Defect, type WorkOrder, type WorkOrderChanges } from "@/lib/api-types"
import { crewName, statusLabel, typeName, workOrderStatusLabel } from "@/lib/labels"
import { formatWhen } from "@/lib/time"
import { cn } from "@/lib/utils"

type Action = "approve" | "reject" | "done" | "edit"
type Notice = { tone: "info" | "error"; text: string }

type Props = {
  // The job to show, by ID; null closes the sheet.
  orderId: number | null
  // The page's copy of that job, shown while GET /work-orders/{id} loads.
  listed: WorkOrder | null
  // Changes after any action; the sheet reloads the job when it does.
  refreshKey: number
  defects: Map<number, Defect>
  now: number
  onClose: () => void
  // Ask the page to reload everything from the API after an action.
  onChanged: () => void
}

const primary =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
const outline =
  "inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"

function defectsWord(n: number): string {
  return n === 1 ? "1 defect becomes" : `${n} defects become`
}

// The question and detail each action asks before it runs (decision 71).
function confirmText(action: Action, order: WorkOrder, changes: WorkOrderChanges | null) {
  const n = order.defect_ids.length
  switch (action) {
    case "approve":
      return { title: `Approve job ${order.id}?`, detail: `${defectsWord(n)} Scheduled. The crew can start.` }
    case "reject":
      return { title: `Reject job ${order.id}?`, detail: "The draft is set aside. Its defects do not change." }
    case "done":
      return { title: `Mark job ${order.id} done?`, detail: `${defectsWord(n)} Fixed. Later passes confirm the repair.` }
    case "edit": {
      const kept = changes?.defect_ids?.length ?? n
      return { title: `Save changes to job ${order.id}?`, detail: `The draft keeps ${kept === 1 ? "1 defect" : `${kept} defects`} and still needs approval.` }
    }
  }
}

function ActionButton({
  action,
  label,
  style,
  busy,
  spinning,
  register,
  onAsk,
}: {
  action: Action
  label: string
  style: string
  busy: boolean
  spinning: boolean
  register: (action: Action, el: HTMLButtonElement | null) => void
  onAsk: (action: Action) => void
}) {
  return (
    <button ref={(el) => register(action, el)} type="button" disabled={busy} onClick={() => onAsk(action)} className={style}>
      {spinning && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
      {label}
    </button>
  )
}

// `emptied` is true when the action was an edit that left no defects: the
// backend refuses that with 409 (decision 89).
function actionNotice(error: unknown, emptied: boolean): Notice {
  if (error instanceof ApiError && error.status === 409 && emptied) {
    return { tone: "error", text: "A job needs at least one defect. Reject the job instead." }
  }
  if (error instanceof ApiError && error.status === 409) return { tone: "info", text: "This job changed. Showing the latest." }
  if (error instanceof ApiError && error.status !== 0) return { tone: "error", text: error.message }
  return { tone: "error", text: "Can't reach the server." }
}

// `key` is the refreshKey the job was loaded for.
type Fresh = { id: number; key: number; order: WorkOrder }

// Sheet for one work order (brief section 5.3): the agent's description, the
// defects it cites, and the actions v0 defines for its status. Every action
// asks first. Drafts can be edited (PATCH) before approval. The job itself
// comes from GET /work-orders/{id} (decision 87).
export function WorkOrderSheet({ orderId, listed, refreshKey, defects, now, onClose, onChanged }: Props) {
  const [fresh, setFresh] = useState<Fresh | null>(null)
  const [running, setRunning] = useState<Action | null>(null)
  const [asking, setAsking] = useState<Action | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [draft, setDraft] = useState<{ description: string; crew_type: string; keep: number[] } | null>(null)
  const confirmed = useRef(false)
  const buttonRefs = useRef(new Map<Action, HTMLButtonElement>())

  useEffect(() => {
    if (orderId === null) return
    const controller = new AbortController()
    getWorkOrder(orderId, { signal: controller.signal })
      .then((order) => setFresh({ id: orderId, key: refreshKey, order }))
      .catch(() => {
        // The page's copy stays on screen; the page shows load errors.
      })
    return () => controller.abort()
  }, [orderId, refreshKey])

  // Prefer the job as GET /work-orders/{id} returned it for the latest
  // refresh; until then, the list's copy.
  const own = fresh?.id === orderId ? fresh : null
  const order = orderId === null ? null : own && (own.key === refreshKey || !listed) ? own.order : listed

  const changes: WorkOrderChanges | null =
    order && draft
      ? {
          ...(draft.description !== order.description ? { description: draft.description } : {}),
          ...(draft.crew_type !== order.crew_type ? { crew_type: draft.crew_type } : {}),
          ...(draft.keep.length !== order.defect_ids.length ? { defect_ids: draft.keep } : {}),
        }
      : null

  async function run(action: Action) {
    if (!order) return
    setRunning(action)
    setNotice(null)
    try {
      if (action === "approve") await approveWorkOrder(order.id)
      else if (action === "reject") await rejectWorkOrder(order.id)
      else if (action === "done") await finishWorkOrder(order.id)
      else if (changes) await editWorkOrder(order.id, changes)
      if (action === "edit") setDraft(null)
      onChanged()
    } catch (error) {
      const emptied = action === "edit" && changes?.defect_ids?.length === 0
      setNotice(actionNotice(error, emptied))
      // A 409 means the job changed elsewhere, except for an emptied edit:
      // the job is as it was, so the draft stays open.
      if (error instanceof ApiError && error.status === 409 && !emptied) onChanged()
    } finally {
      setRunning(null)
    }
  }

  // Every action needs the action code once per session.
  function ask(action: Action) {
    void guarded(() => {
      confirmed.current = false
      setNotice(null)
      setAsking(action)
    })
  }

  function close() {
    setDraft(null)
    setNotice(null)
    onClose()
  }

  const text = order && asking ? confirmText(asking, order, changes) : null
  const busy = running !== null

  // Remembers each action button, so a cancelled dialog hands focus back to it.
  function register(action: Action, el: HTMLButtonElement | null) {
    if (el) buttonRefs.current.set(action, el)
  }

  return (
    <Sheet open={order !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        {order && (
          <>
            <SheetHeader>
              <SheetTitle>
                Job <span className="tabular">{order.id}</span> · {crewName(order.crew_type)}
              </SheetTitle>
              <SheetDescription>
                {workOrderStatusLabel[order.status]} · drafted {formatWhen(order.created_at, now)}
                {order.approved_at && <> · approved {formatWhen(order.approved_at, now)}</>}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4 pb-6 text-sm">
              {order.status === "pending_approval" && (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Drafted by agent, needs approval. Nothing goes to a crew until you approve it.
                </p>
              )}

              {notice && (
                <p
                  role={notice.tone === "error" ? "alert" : "status"}
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs",
                    notice.tone === "error" ? "border-status-high/50" : "border-border text-muted-foreground"
                  )}
                >
                  {notice.text}
                </p>
              )}

              {draft ? (
                <section aria-label="Edit draft" className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Description
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      rows={4}
                      className="rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Crew type
                    <input
                      value={draft.crew_type}
                      onChange={(e) => setDraft({ ...draft, crew_type: e.target.value })}
                      className="rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground"
                    />
                  </label>
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1 text-xs text-muted-foreground">Defects in this job</legend>
                    {order.defect_ids.map((id) => {
                      const d = defects.get(id)
                      return (
                        <label key={id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.keep.includes(id)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                keep: e.target.checked ? [...draft.keep, id] : draft.keep.filter((k) => k !== id),
                              })
                            }
                          />
                          {d ? typeName(d.type) : "Defect"} <span className="tabular text-muted-foreground">#{id}</span>
                        </label>
                      )
                    })}
                  </fieldset>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setDraft(null)} className={outline}>
                      Cancel
                    </button>
                    {/* Unticking every defect is allowed: the backend answers 409 and the sheet says why (decision 89). */}
                    <ActionButton
                      action="edit"
                      label="Save changes"
                      style={primary}
                      busy={busy || !changes || Object.keys(changes).length === 0}
                      spinning={running === "edit"}
                      register={register}
                      onAsk={ask}
                    />
                  </div>
                </section>
              ) : (
                <section aria-label="Description">
                  <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Agent&apos;s description</h3>
                  <p>{order.description}</p>
                </section>
              )}

              <section aria-label="Defects cited">
                <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Defects cited · <span className="tabular">{order.defect_ids.length}</span>
                </h3>
                <ul className="flex flex-col gap-1">
                  {order.defect_ids.map((id) => {
                    const d = defects.get(id)
                    return (
                      <li key={id}>
                        <Link
                          href={`/?defect=${id}`}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                        >
                          {d ? (
                            <>
                              <span className="w-16">{typeName(d.type)}</span>
                              <UrgencyBadge band={d.urgency_band} />
                              <span className="text-xs text-muted-foreground">{statusLabel[d.status]}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Outside the loaded area</span>
                          )}
                          <span className="tabular ml-auto text-xs text-muted-foreground">#{id}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {/* The actions v0 defines for this status (decision 71). */}
              {!draft && order.status === "pending_approval" && (
                <div className="flex flex-col gap-2">
                  <ActionButton action="approve" label="Approve" style={primary} busy={busy} spinning={running === "approve"} register={register} onAsk={ask} />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        guarded(() =>
                          setDraft({ description: order.description, crew_type: order.crew_type, keep: [...order.defect_ids] })
                        )
                      }
                      className={outline}
                    >
                      Edit
                    </button>
                    <ActionButton action="reject" label="Reject" style={outline} busy={busy} spinning={running === "reject"} register={register} onAsk={ask} />
                  </div>
                </div>
              )}
              {!draft && order.status === "approved" && (
                <ActionButton action="done" label="Mark done" style={primary} busy={busy} spinning={running === "done"} register={register} onAsk={ask} />
              )}
            </div>

            <ConfirmDialog
              open={asking !== null}
              title={text?.title ?? ""}
              description={text?.detail}
              onConfirm={() => {
                const action = asking
                confirmed.current = true
                setAsking(null)
                if (action) void run(action)
              }}
              onCancel={() => setAsking(null)}
              finalFocus={() =>
                confirmed.current || !asking ? false : (buttonRefs.current.get(asking) ?? true)
              }
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
