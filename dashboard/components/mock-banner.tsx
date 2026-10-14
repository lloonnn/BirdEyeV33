import { FlaskConicalIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Shown on any page that displays mock data (Rule 5).
export function MockBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <FlaskConicalIcon className="size-3.5" aria-hidden />
      Mock data: invented for the prototype
    </div>
  )
}
