"use client"

// The one Leaflet map component (plain Leaflet, decision 55). Load it through
// map-loader.tsx, never directly: Leaflet needs the browser.

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import type { Bbox } from "@/lib/api-types"
import { mapTiles, mapView } from "@/lib/config"
import "./leaflet-map.css"

// A status token from globals.css: `--status-high` and so on.
export type PinTone = "high" | "medium" | "low" | "done" | "neutral"

export type MapPin = {
  id: number
  lat: number
  lon: number
  tone: PinTone
  // Filled circle or hollow ring, so the pin reads without colour.
  shape: "filled" | "ring"
  // Hover text, in words.
  label: string
}

type Props = {
  pins: MapPin[]
  // Called with the visible area on load and after every pan or zoom.
  onViewChange: (bbox: Bbox) => void
}

function toBbox(bounds: L.LatLngBounds): Bbox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
}

export default function LeafletMap({ pins, onViewChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pinLayerRef = useRef<L.LayerGroup | null>(null)
  const onViewChangeRef = useRef(onViewChange)

  useEffect(() => {
    onViewChangeRef.current = onViewChange
  }, [onViewChange])

  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: mapView.center,
      zoom: mapView.zoom,
      minZoom: mapView.minZoom,
      maxZoom: mapView.maxZoom,
      zoomControl: false,
    })
    L.control.zoom({ position: "bottomright" }).addTo(map)
    L.tileLayer(mapTiles.url, {
      attribution: mapTiles.attribution,
      maxZoom: mapView.maxZoom,
    }).addTo(map)
    pinLayerRef.current = L.layerGroup().addTo(map)

    const report = () => onViewChangeRef.current(toBbox(map.getBounds()))
    map.on("moveend", report)
    report()

    return () => {
      map.remove()
      pinLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const layer = pinLayerRef.current
    if (!layer) return
    layer.clearLayers()

    // Read the colours from the theme tokens, so globals.css stays the source of truth.
    const css = getComputedStyle(document.documentElement)
    const background = css.getPropertyValue("--background").trim()
    for (const pin of pins) {
      const color = css.getPropertyValue(`--status-${pin.tone}`).trim()
      const marker =
        pin.shape === "filled"
          ? L.circleMarker([pin.lat, pin.lon], {
              radius: 7,
              color: background,
              weight: 1.5,
              fillColor: color,
              fillOpacity: 0.95,
            })
          : L.circleMarker([pin.lat, pin.lon], {
              radius: 6,
              color,
              weight: 3,
              // Transparent fill keeps the centre of the ring hoverable.
              fillColor: color,
              fillOpacity: 0,
            })
      marker.bindTooltip(pin.label, {
        direction: "top",
        offset: [0, -8],
        className: "be-map-tooltip",
      })
      marker.addTo(layer)
    }
  }, [pins])

  return <div ref={containerRef} className="be-map isolate h-full w-full" />
}
