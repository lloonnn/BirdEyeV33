"use client"

import { useRef } from "react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  title: string
  // Crop to show, or null for the "Invented crop" placeholder.
  cropSrc: string | null
  cropAlt: string
  description: React.ReactNode
  // Extra content, for example a choice list.
  children?: React.ReactNode
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  // Where focus goes when the dialog closes; false leaves it to the caller.
  finalFocus: () => HTMLElement | boolean
}

// One confirmation dialog for answers and actions: crop, words, Confirm.
// Enter confirms (focus starts on Confirm), Esc cancels.
export function ConfirmDialog({
  open,
  title,
  cropSrc,
  cropAlt,
  description,
  children,
  confirmDisabled,
  onConfirm,
  onCancel,
  finalFocus,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      {open && (
        <DialogContent initialFocus={confirmRef} finalFocus={finalFocus} className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!confirmDisabled) onConfirm()
            }}
            className="flex flex-col gap-4"
          >
            <DialogTitle>{title}</DialogTitle>
            {cropSrc ? (
              // The backend's crop host is not known at build time, so next/image cannot be configured for it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cropSrc} alt={cropAlt} className="aspect-video w-full rounded-md object-cover" />
            ) : (
              <div
                className={cn(
                  "flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border bg-muted text-xs text-muted-foreground"
                )}
              >
                Invented crop
              </div>
            )}
            <DialogDescription>{description}</DialogDescription>
            {children}
            <DialogFooter>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="submit"
                disabled={confirmDisabled}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Confirm
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
