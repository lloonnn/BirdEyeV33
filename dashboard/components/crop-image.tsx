"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

// A defect crop. `src` is null in mock mode (the crop is invented) and a URL
// from cropSrc() in real mode. A crop that fails to load shows text, never a
// blank box.
export function CropImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  // The src that failed, so a different crop starts fresh.
  const [failed, setFailed] = useState<string | null>(null)
  if (src && failed !== src) {
    return (
      // The backend's crop host is not known at build time, so next/image cannot be configured for it.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} onError={() => setFailed(src)} className={cn("aspect-video w-full object-cover", className)} />
    )
  }
  return (
    <div
      className={cn(
        "flex aspect-video w-full items-center justify-center border border-dashed border-border bg-muted text-xs text-muted-foreground",
        className
      )}
    >
      {src ? "Crop not available" : "Invented crop"}
    </div>
  )
}
