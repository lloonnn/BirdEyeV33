"use client"

import dynamic from "next/dynamic"

// Leaflet needs the browser, so the map never renders on the server.
// `ssr: false` only works inside a Client Component (Next.js 16 lazy-loading guide).
export const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-background" />,
})
