"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { EyeIcon, LockIcon, LockOpenIcon, RotateCcwIcon } from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"

import { MockLabel } from "@/components/mock-label"
import { guarded, lock, requestUnlock, useActionLock } from "@/lib/action-lock"
import { getReviews, getWorkOrders, inMockMode, resetMockData, usesMock } from "@/lib/api"
import { useLastUpdated } from "@/lib/last-updated"
import { navItems } from "@/lib/nav"
import { setNavCount, useNavCounts } from "@/lib/nav-counts"
import { formatClock } from "@/lib/time"
import { cn } from "@/lib/utils"

// Top bar on every page: the pill menu centred, with the brand as its first
// item; the update time and mock label at the far right. 16 px from the edges.
export function PillMenu() {
  const pathname = usePathname()
  const lastUpdated = useLastUpdated()
  const counts = useNavCounts()
  const [resetting, setResetting] = useState(false)
  const { unlocked } = useActionLock()
  const resetButtonRef = useRef<HTMLButtonElement>(null)
  const badge: Partial<Record<string, number | null>> = { "/review": counts.review, "/work-orders": counts.workOrders }

  // Load each badge once if no page has set it yet. Badges are optional; the
  // pages show any error themselves.
  useEffect(() => {
    if (counts.review !== null) return
    const controller = new AbortController()
    getReviews({ signal: controller.signal })
      .then((reviews) => setNavCount("review", reviews.filter((r) => r.status === "pending").length))
      .catch(() => {})
    return () => controller.abort()
  }, [counts.review])

  useEffect(() => {
    if (counts.workOrders !== null) return
    const controller = new AbortController()
    getWorkOrders({ status: "pending_approval" }, { signal: controller.signal })
      .then((orders) => setNavCount("workOrders", orders.length))
      .catch(() => {})
    return () => controller.abort()
  }, [counts.workOrders])

  return (
    <header className="pointer-events-none fixed inset-x-4 top-4 z-50 flex h-11 items-center justify-end">
      <nav
        aria-label="Main"
        className="panel pointer-events-auto absolute left-1/2 flex h-11 max-w-[calc(100vw-34.125rem)] -translate-x-1/2 items-center rounded-full p-1"
      >
        {/* The menu's max width leaves the status pill plus 16 px gaps on both sides. */}
        <Link href="/" className="flex shrink-0 items-center gap-2 pr-2 pl-3 text-sm font-semibold">
          <EyeIcon className="size-4" aria-hidden />
          Bird Eye v33
        </Link>
        <ul className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {navItems.map((item) => {
            const active = pathname === item.url
            return (
              <li key={item.url}>
                <Link
                  href={item.url}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors xl:px-3.5",
                    active
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.title}
                  {(badge[item.url] ?? 0) > 0 && (
                    <span
                      aria-label={`${badge[item.url]} waiting`}
                      className={cn(
                        "tabular ml-1.5 rounded-full px-1.5 py-px text-[11px]",
                        active ? "bg-primary-foreground/15" : "bg-white/10 text-foreground"
                      )}
                    >
                      {badge[item.url]}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Tighter spacing below 1280 px keeps the pill clear of the menu. */}
      <div className="panel pointer-events-auto flex h-11 items-center gap-2 rounded-full py-0 pr-1.5 pl-3 text-xs text-muted-foreground xl:gap-3 xl:pl-4">
        <span>
          {lastUpdated ? (
            <>
              {/* Below 1280 px only the time shows, so the pill clears the menu. */}
              <span className="hidden xl:inline">Updated </span>
              <span className="tabular text-foreground" title="Last updated">
                {formatClock(lastUpdated)}
              </span>
            </>
          ) : (
            "Not updated yet"
          )}
        </span>
        {/* Locked: click to unlock. Unlocked: click to lock again. */}
        <button
          type="button"
          onClick={() => (unlocked ? lock() : void requestUnlock())}
          aria-label={unlocked ? "Actions unlocked. Lock them" : "Actions locked. Unlock them"}
          title={unlocked ? "Actions unlocked: click to lock" : "Actions locked: click to unlock"}
          className="-mx-1 flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          {unlocked ? <LockOpenIcon className="size-3.5" aria-hidden /> : <LockIcon className="size-3.5" aria-hidden />}
        </button>
        {usesMock("getDefects") && <MockLabel className="rounded-full" />}
        {inMockMode && (
          <button
            ref={resetButtonRef}
            type="button"
            onClick={() => guarded(() => setResetting(true))}
            aria-label="Reset mock data"
            title="Reset mock data"
            className="-ml-1.5 flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <RotateCcwIcon className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      <ConfirmDialog
        open={resetting}
        title="Reset mock data?"
        description="Every change made in mock mode goes back to the invented starting data. The page reloads."
        onConfirm={() => {
          resetMockData()
          window.location.reload()
        }}
        onCancel={() => setResetting(false)}
        finalFocus={() => resetButtonRef.current ?? true}
      />
    </header>
  )
}
