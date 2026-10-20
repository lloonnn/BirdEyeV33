"use client"

import { useRef } from "react"

import { CropImage } from "@/components/crop-image"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"

type Props = {
  open: boolean
  title: string
  // Crop to show, or null for the "Invented crop" placeholder. Leave both out
  // for a dialog without a photo, such as a work order action.
  cropSrc?: string | null
  cropAlt?: string
  description: React.ReactNode
  // Extra content, for example a choice list.
  children?: React.ReactNode
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  // Where focus goes when the dialog closes; false leaves it to the caller.
  finalFocus: () => HTMLElement | boolean
}

// One confirmation dialog for answers and actions: optional crop, words, Confirm.
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
            {cropAlt === undefined ? null : <CropImage src={cropSrc ?? null} alt={cropAlt} className="rounded-md" />}
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
