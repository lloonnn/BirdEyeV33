// Dashboard settings. Every map reads its base layer from here, so the tile
// source changes in one place. Numbers are starting values, to be tuned.

// Decision 81: CARTO Dark Matter with CARTO and OpenStreetMap attribution,
// prototype use only. Licence to clear before any SDP deployment.
// CARTO now serves an "API key required" watermark without a key. Put the
// free key in NEXT_PUBLIC_CARTO_KEY (dashboard/.env.local); tile keys are
// visible in the browser by design.
const cartoKey = process.env.NEXT_PUBLIC_CARTO_KEY

// CARTO's documented raster form: basemaps.cartocdn.com/rastertiles/<style>.
// `dark_all` is Dark Matter. `{r}` asks for @2x tiles on high-density screens.
export const mapTiles = {
  url:
    "https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png" +
    (cartoKey ? `?key=${encodeURIComponent(cartoKey)}` : ""),
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
} as const

// First view: the pilot precinct in City of Elmina. Starting value, to be tuned.
export const mapView = {
  center: [3.185, 101.515] as [number, number],
  zoom: 15,
  minZoom: 12,
  maxZoom: 19,
}

// Wait after the last pan or zoom before loading defects. Starting value, to be tuned.
export const defectsReloadDebounceMs = 300

// Reload the visible defects on this interval; the contract has no push
// channel. Starting value, to be tuned.
export const defectsPollMs = 30_000

// Mock mode only: delay on every mock call, so loading states show as they
// would with a real server. Starting value, to be tuned.
export const mockLatencyMs = 250
