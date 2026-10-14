"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { EyeIcon } from "lucide-react"

import { MockLabel } from "@/components/mock-label"
import { getReviews, usesMock } from "@/lib/api"
import { useLastUpdated } from "@/lib/last-updated"
import { navItems } from "@/lib/nav"
import { setReviewCount, useReviewCount } from "@/lib/review-count"
import { formatClock } from "@/lib/time"
import { cn } from "@/lib/utils"

// Top bar on every page: the pill menu centred, with the brand as its first
// item; the update time and mock label at the far right. 16 px from the edges.
export function PillMenu() {
  const pathname = usePathname()
  const lastUpdated = useLastUpdated()
  const reviewCount = useReviewCount()

  // Load the Review badge once if no page has set it yet.
  useEffect(() => {
    if (reviewCount !== null) return
    const controller = new AbortController()
    getReviews({ signal: controller.signal })
      .then((reviews) => setReviewCount(reviews.filter((r) => r.status === "pending").length))
      .catch(() => {
        // The badge is optional; the Review page shows any error itself.
      })
    return () => controller.abort()
  }, [reviewCount])

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
                    "block rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.title}
                  {item.url === "/review" && reviewCount !== null && reviewCount > 0 && (
                    <span
                      aria-label={`${reviewCount} waiting`}
                      className={cn(
                        "tabular ml-1.5 rounded-full px-1.5 py-px text-[11px]",
                        active ? "bg-primary-foreground/15" : "bg-white/10 text-foreground"
                      )}
                    >
                      {reviewCount}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="panel pointer-events-auto flex h-11 items-center gap-3 rounded-full py-0 pr-1.5 pl-4 text-xs text-muted-foreground">
        <span>
          {lastUpdated ? (
            <>
              Updated <span className="tabular text-foreground">{formatClock(lastUpdated)}</span>
            </>
          ) : (
            "Not updated yet"
          )}
        </span>
        {usesMock("getDefects") && <MockLabel className="rounded-full" />}
      </div>
    </header>
  )
}
