// Times show in Malaysia time (UTC+08:00), whatever the viewer's clock says.
const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kuala_Lumpur",
})

// "14:05"
export function formatClock(date: Date): string {
  return clock.format(date)
}
