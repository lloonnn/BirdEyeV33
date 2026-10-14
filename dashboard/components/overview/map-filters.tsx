import type { DefectStatus, DefectType } from "@/lib/api-types"
import { statusLabel, typeLabel } from "@/lib/labels"
import { cn } from "@/lib/utils"

export type DefectFilters = {
  // Sent to GET /defects as `type` and `status` (decision 63).
  type?: DefectType
  status?: DefectStatus
  // Client side: confirmed and rejected stay hidden unless this is on.
  showClosed: boolean
}

const statuses = Object.keys(statusLabel) as DefectStatus[]

type Props = {
  value: DefectFilters
  onChange: (value: DefectFilters) => void
  className?: string
}

export function MapFilters({ value, onChange, className }: Props) {
  const typeOptions: { label: string; type?: DefectType }[] = [
    { label: "All" },
    { label: typeLabel.pothole, type: "pothole" },
    { label: typeLabel.crack, type: "crack" },
  ]

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div role="group" aria-label="Type" className="flex gap-0.5 rounded-md bg-muted p-0.5">
        {typeOptions.map((option) => {
          const active = value.type === option.type
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...value, type: option.type })}
              className={cn(
                "flex-1 rounded-sm px-2 py-1 text-xs transition-colors",
                active ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Status
        <select
          value={value.status ?? ""}
          onChange={(e) =>
            onChange({ ...value, status: (e.target.value || undefined) as DefectStatus | undefined })
          }
          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground [color-scheme:dark]"
        >
          <option value="">All open</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {statusLabel[status]}
            </option>
          ))}
        </select>
      </label>

      {/* With one status chosen, the server filters and this chip has no effect. */}
      <button
        type="button"
        aria-pressed={value.showClosed}
        disabled={value.status !== undefined}
        onClick={() => onChange({ ...value, showClosed: !value.showClosed })}
        className={cn(
          "w-fit rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40",
          value.showClosed
            ? "border-foreground/40 bg-accent text-foreground"
            : "border-border text-muted-foreground hover:text-foreground"
        )}
      >
        {value.showClosed ? "Showing confirmed and rejected" : "Show confirmed and rejected"}
      </button>
    </div>
  )
}
