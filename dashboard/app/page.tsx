import { Suspense } from "react"

import { Overview } from "@/components/overview/overview"

// Overview is the home page: the map fills the viewport behind the pill menu,
// fixed so the page never scrolls. Suspense lets it read ?defect= on the client.
export default function OverviewPage() {
  return (
    <Suspense>
      <Overview />
    </Suspense>
  )
}
