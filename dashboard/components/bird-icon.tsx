import { cn } from "@/lib/utils"

// The Bird Eye mark: the same bird as app/icon.svg, drawn in the text colour so
// it follows the theme. The eye is a hole in the shape.
export function BirdIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="2 12 60 40" fill="currentColor" aria-hidden className={cn("h-4 w-auto", className)}>
      <path d="M13,34a17,15 0 1,1 34,0a17,15 0 1,1 -34,0ZM32,25a10,10 0 1,1 20,0a10,10 0 1,1 -20,0ZM50,21L59,26L50,30ZM16,30L17,38L4,40L8,34L4,26ZM45,23a2,2 0 1,0 4,0a2,2 0 1,0 -4,0Z" />
    </svg>
  )
}
