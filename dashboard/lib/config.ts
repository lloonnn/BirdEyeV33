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

// First view: the centre of the pilot area. Starting value, to be tuned.
export const mapView = {
  center: [3.185, 101.515] as [number, number],
  zoom: 15,
  minZoom: 12,
  maxZoom: 19,
}

// Wait after the last pan or zoom before loading defects. Starting value, to be tuned.
export const defectsReloadDebounceMs = 300

// Real mode: reload the Overview's counts, Most urgent list and pins on this
// interval while the tab is visible; the contract has no push channel.
// Starting value, to be tuned.
export const defectsPollMs = 30_000

// Mock mode only: delay on every mock call, so loading states show as they
// would with a real server. Starting value, to be tuned.
export const mockLatencyMs = 250

// The pilot area as a bbox (minLon, minLat, maxLon, maxLat), from the brief's
// seed area. The map falls back to it when no defects are found, and the Work
// orders page loads its defects from it. A query area, not a township boundary
// setting (out of scope). Starting value, to be tuned.
export const areaBounds: [number, number, number, number] = [101.5, 3.17, 101.53, 3.2]

// The whole region the backend can hold, as a bbox (minLon, minLat, maxLon,
// maxLat). The stage counts and the Most urgent list count it; in real mode
// the first fit uses the defects found in it. The map pins load what is in view. The whole world
// is a safe starting value, to be tuned.
export const regionBounds: [number, number, number, number] = [-180, -90, 180, 90]

// GET /defects returns at most this many defects when no `limit` is sent
// (manager's decision, 15 Oct). Mirrors the backend default: the map says
// pins may be missing when a response has exactly this many.
export const defectsDefaultLimit = 500

// Rows in the Most urgent list (brief section 5.1).
export const fixFirstCount = 5

// Zoom when a list row flies the map to a defect. Starting value, to be tuned.
export const flyToZoom = 17

// Glass on floating panels. Set false to put .no-glass on the page root:
// solid panels, no blur, same layout. Use it if panning stutters.
export const glassPanels = true

// Shown for a fixed defect: about 3 clean passes confirm a repair
// (decision 41). The backend decides; this only words the panel. Starting value.
export const cleanPassesToConfirm = 3

// "Why it ranks here" lists the urgency terms at or above this value.
// Starting value, to be tuned.
export const whyTermMin = 0.8
