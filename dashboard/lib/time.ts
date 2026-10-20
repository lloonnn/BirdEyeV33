// Times show in Malaysia time (UTC+08:00), whatever the viewer's clock says.
const TZ = "Asia/Kuala_Lumpur"

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
})

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
})

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: TZ,
})

// "12 Oct", in Malaysia time.
export function formatDay(iso: string): string {
  return day.format(new Date(iso))
}

// "14:05"
export function formatClock(date: Date): string {
  return clock.format(date)
}

// Relative when recent ("12 min ago", "5 h ago"), absolute when older
// ("12 Oct, 08:14"), per brief section 7. `now` is passed in so rendering
// stays pure; callers use the time the data loaded.
export function formatWhen(iso: string, now: number): string {
  const ms = now - Date.parse(iso)
  const min = Math.round(ms / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`
  return dateTime.format(new Date(iso))
}
