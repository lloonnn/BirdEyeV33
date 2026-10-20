import type { Metadata } from "next"

import { ReviewQueue } from "@/components/review/review-queue"

export const metadata: Metadata = { title: "Review" }

export default function ReviewPage() {
  return <ReviewQueue />
}
