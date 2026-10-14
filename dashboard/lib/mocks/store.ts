// Invented data for the prototype.
// One in-memory store for every mock function, so a mock action on one page
// shows on every other page (Rule 4). It resets on a full page reload.

import type { Defect } from "@/lib/api-types"
import { seedDefects } from "@/lib/mocks/defects"

export const store: { defects: Defect[] } = {
  defects: seedDefects(Date.now()),
}
