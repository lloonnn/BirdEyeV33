"use client"

import { useEffect, useState } from "react"
import { CloudOffIcon } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorkOrderSheet } from "@/components/work-orders/work-order-sheet"
import { getDefects, getWorkOrders } from "@/lib/api"
import { ApiError, type Defect, type WorkOrder, type WorkOrderStatus } from "@/lib/api-types"
import { areaBounds } from "@/lib/config"
import { crewName, typeCount, workOrderStatusLabel } from "@/lib/labels"
import { setLastUpdated } from "@/lib/last-updated"
import { setNavCount } from "@/lib/nav-counts"
import { formatClock, formatWhen } from "@/lib/time"

// `key` is the refreshKey the data was loaded for.
type Loaded = { key: number; orders: WorkOrder[]; defects: Map<number, Defect>; at: Date }

// Tab order: what needs a decision first.
const statuses: WorkOrderStatus[] = ["pending_approval", "approved", "done", "rejected"]

function failureText(error: unknown, lastAt: Date | null): string {
  const head =
    error instanceof ApiError && error.status !== 0
      ? `The server returned an error: ${error.message}`
      : "Can't reach the server."
  return lastAt ? `${head} Showing the last data from ${formatClock(lastAt)}.` : head
}

// "1 pothole, 1 crack": each type with its count, in plain words. A cited
// defect outside the loaded area counts as "unknown".
function coveredText(order: WorkOrder, defects: Map<number, Defect>): string {
  const byType = new Map<string, number>()
  for (const id of order.defect_ids) {
    const type = defects.get(id)?.type ?? "unknown"
    byType.set(type, (byType.get(type) ?? 0) + 1)
  }
  return [...byType].map(([type, n]) => typeCount(type, n)).join(", ")
}

// Work orders page (brief section 5.3): agent-drafted jobs. Working page:
// solid table, no glass. Nothing is sent without a supervisor's approval.
export function WorkOrdersPage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<WorkOrderStatus>("pending_approval")
  // The open job, by ID, so the sheet always shows the latest load.
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    // The defects give each job's types; v0 work orders carry only IDs.
    Promise.all([
      getWorkOrders({}, { signal: controller.signal }),
      getDefects({ bbox: areaBounds }, { signal: controller.signal }),
    ])
      .then(([orders, defects]) => {
        const at = new Date()
        setLoaded({ key: refreshKey, orders, defects: new Map(defects.map((d) => [d.id, d])), at })
        setError(null)
        setLastUpdated(at)
        setNavCount("workOrders", orders.filter((o) => o.status === "pending_approval").length)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err)
      })
    return () => controller.abort()
  }, [refreshKey])

  const now = loaded?.at.getTime() ?? 0
  const visible =
    loaded?.orders
      .filter((o) => o.status === tab)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) ?? null
  const count = (s: WorkOrderStatus) => loaded?.orders.filter((o) => o.status === s).length ?? 0

  return (
    <div className="flex flex-col gap-4 px-4 pt-19 pb-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Work orders</h1>
        <p className="text-sm text-muted-foreground">Drafted by the agent. Nothing goes to a crew without approval.</p>
      </header>

      {error !== null && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <CloudOffIcon className="size-4 text-status-high" aria-hidden />
          {failureText(error, loaded?.at ?? null)}
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => setTab(value as WorkOrderStatus)}>
        <TabsList aria-label="Status">
          {statuses.map((s) => (
            <TabsTrigger key={s} value={s}>
              {workOrderStatusLabel[s]} {loaded && <span className="tabular">{count(s)}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Defects covered</TableHead>
              <TableHead>Crew type</TableHead>
              <TableHead>Drafted</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!visible ? (
              error === null &&
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No {workOrderStatusLabel[tab].toLowerCase()} work orders.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((order) => (
                <TableRow
                  key={order.id}
                  tabIndex={0}
                  aria-label={`Open job ${order.id}`}
                  onClick={() => setOpenId(order.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setOpenId(order.id)
                    }
                  }}
                  className="cursor-pointer focus-visible:bg-accent focus-visible:outline-none"
                >
                  <TableCell className="tabular">#{order.id}</TableCell>
                  <TableCell>{coveredText(order, loaded!.defects)}</TableCell>
                  <TableCell>{crewName(order.crew_type)}</TableCell>
                  <TableCell>{formatWhen(order.created_at, now)}</TableCell>
                  <TableCell>
                    {workOrderStatusLabel[order.status]}
                    {order.status === "pending_approval" && (
                      <span className="block text-xs text-muted-foreground">Drafted by agent, needs approval</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <WorkOrderSheet
        order={loaded?.orders.find((o) => o.id === openId) ?? null}
        defects={loaded?.defects ?? new Map()}
        now={now}
        onClose={() => setOpenId(null)}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
