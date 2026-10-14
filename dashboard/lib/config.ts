// Dashboard settings. Every map reads its base layer from here, so the tile
// source changes in one place.

export const mapTiles = {
  // CARTO Dark Matter. Prototype use; licence to clear before any SDP deployment.
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  subdomains: "abcd",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
} as const
