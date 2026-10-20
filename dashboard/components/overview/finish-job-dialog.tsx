"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2Icon } from "lucide-react"

import { TypeBadge } from "@/components/overview/badges"
import { Skeleton } from "@/components/ui/skeleton"
import { getWorkOrder } from "@/lib/api"
import { ApiError, type Defect, type WorkOrder } from "@/lib/api-types"
import { statusLabel } from "@/lib/labels"

type Props = {
  workOrderId: number
  // Defects already loaded, to name the job's defects without extra calls.
  known: Defect[]
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

type Lookup = { order: WorkOrder | null; error: "missing" | "offline" | null }

// Marking a job done changes every defect in it, so ask first (brief 5.1).
// The job's defect list comes from GET /work-orders/{id} (decision 87).
export function FinishJobDialog({ workOrderId, known, busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [lookup, setLookup] = useState<Lookup | null>(null)

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getWorkOrder(workOrderId, { signal: controller.signal })
      .then((order) => setLookup({ order, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLookup({ order: null, error: error instanceof ApiError && error.status === 404 ? "missing" : "offline" })
      })
    return () => controller.abort()
  }, [workOrderId])

  const byId = new Map(known.map((d) => [d.id, d]))
  const order = lookup?.order ?? null
  // Only an approved job can be marked done (decision 71).
  const approved = order?.status === "approved"
  const n = order?.defect_ids.length ?? 0

  return (
    <dialog
      ref={ref}
      aria-labelledby="finish-job-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
      className="m-auto w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-0 text-sm text-foreground shadow-xl backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 id="finish-job-title" className="text-base font-semibold">
          Mark job <span className="tabular">{workOrderId}</span> done?
        </h2>

        {!lookup ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : lookup.error === "offline" ? (
          <p role="alert" className="text-muted-foreground">Can&apos;t reach the server to load this job.</p>
        ) : !order ? (
          <p role="alert" className="text-muted-foreground">
            Job <span className="tabular">{workOrderId}</span> no longer exists.
          </p>
        ) : !approved ? (
          <p role="alert" className="text-muted-foreground">
            Job <span className="tabular">{workOrderId}</span> is not an approved job, so it cannot be marked done.
          </p>
        ) : (
          <>
            <p>
              <span className="tabular">{n}</span> {n === 1 ? "defect becomes" : "defects become"} Fixed:
            </p>
            <ul className="flex flex-col gap-1.5 rounded-md border border-border p-2">
              {order.defect_ids.map((id) => {
                const d = byId.get(id)
                return (
                  <li key={id} className="flex items-center gap-2 text-xs">
                    <span className="tabular w-10">#{id}</span>
                    {d ? (
                      <>
                        <TypeBadge type={d.type} />
                        <span className="text-muted-foreground">now {statusLabel[d.status]}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">outside the loaded area</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">{order.description}</p>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || !approved}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          {busy ? "Marking done…" : "Mark job done"}
        </button>
      </div>
    </dialog>
  )
}
