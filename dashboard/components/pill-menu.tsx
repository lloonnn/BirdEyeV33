"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { EyeIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { navItems } from "@/lib/nav"

// Floating menu at the top centre of every page. Solid panel, not glass:
// glass is only for the Overview's floating panels (Rule in dashboard/CLAUDE.md).
export function PillMenu() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-lg"
    >
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 px-2 text-sm font-semibold"
      >
        <EyeIcon className="size-4" aria-hidden />
        <span className="hidden sm:inline">Bird Eye v33</span>
      </Link>

      {/* Scrolls sideways only on screens too narrow for all five links. */}
      <ul className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">

        {navItems.map((item) => {
          const active = pathname === item.url
          return (
            <li key={item.url}>
              <Link
                href={item.url}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.title}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Placeholder until the map polls GET /defects (Phase 2). */}
      <span className="hidden shrink-0 px-2 text-xs text-muted-foreground md:inline">
        Last updated: not yet
      </span>
    </nav>
  )
}
