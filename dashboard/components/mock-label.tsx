import { cn } from "@/lib/utils"

// Small corner label on any page that shows mock data (Rule 5).
export function MockLabel({ className, partly = false }: { className?: string; partly?: boolean }) {
  return (
    <div
      role="note"
      className={cn(
        "rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground",
        className
      )}
    >
      {partly ? "Partly mock data" : "Mock data, invented"}
    </div>
  )
}
