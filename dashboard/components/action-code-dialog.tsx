"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2Icon } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { actionsEnabled, cancelUnlock, tryUnlock, useActionLock } from "@/lib/action-lock"

type Phase = "checking" | "ready" | "sending" | "off" | "error"

// The one "Enter the action code" dialog, mounted once in the root layout.
// It opens when an action asks for the code; Enter submits, Esc cancels.
export function ActionCodeDialog() {
  const { asking } = useActionLock()
  return asking ? <CodeForm /> : null
}

function CodeForm() {
  const [phase, setPhase] = useState<Phase>("checking")
  const [code, setCode] = useState("")
  const [wrong, setWrong] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ask first whether actions are on at all.
  useEffect(() => {
    let live = true
    actionsEnabled().then((enabled) => {
      if (live) setPhase(enabled === null ? "error" : enabled ? "ready" : "off")
    })
    return () => {
      live = false
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if ((phase !== "ready" && phase !== "error") || !code) return
    setPhase("sending")
    const result = await tryUnlock(code)
    if (result === "ok") return
    setPhase(result === "off" ? "off" : result === "error" ? "error" : "ready")
    setWrong(result === "wrong")
    setCode("")
    inputRef.current?.focus()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && cancelUnlock()}>
      {/* Focus goes straight to the code, so typing and Enter is all it takes. */}
      <DialogContent initialFocus={inputRef} className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogTitle>Enter the action code</DialogTitle>
          <DialogDescription>
            {phase === "off"
              ? "Actions are off on this deployment."
              : "Viewing is open to everyone. Changes need the code, once per session."}
          </DialogDescription>
          {phase !== "off" && (
            <input
              ref={inputRef}
              type="password"
              autoComplete="off"
              aria-label="Action code"
              aria-invalid={wrong}
              value={code}
              // Stays enabled while the server is asked, so it can hold focus.
              readOnly={phase === "sending"}
              onChange={(e) => {
                setCode(e.target.value)
                setWrong(false)
              }}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          )}
          {wrong && (
            <p role="alert" className="text-sm">
              Wrong code.
            </p>
          )}
          {phase === "error" && (
            <p role="alert" className="text-sm">
              Can&apos;t check the code right now. Try again.
            </p>
          )}
          <DialogFooter>
            <button type="button" onClick={cancelUnlock} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
              {phase === "off" ? "Close" : "Cancel"}
            </button>
            {phase !== "off" && (
              <button
                type="submit"
                disabled={(phase !== "ready" && phase !== "error") || !code}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {phase === "sending" && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
                Unlock
              </button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
