import { cn } from "@/lib/utils"

// Small corner label on any page that shows mock data (Rule 5).
export function MockLabel({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground",
        className
      )}
    >
      Mock data, invented
    </div>
  )
}
