// Overview is the home page: a full-viewport area behind the pill menu.
// The Leaflet map fills it in Phase 2. Fixed to the viewport, so the page
// never scrolls.
export default function OverviewPage() {
  return <div aria-label="Map area" className="fixed inset-0" />
}
