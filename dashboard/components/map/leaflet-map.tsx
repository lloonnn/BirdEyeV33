"use client"

// The one Leaflet map component (plain Leaflet, decision 55). Load it through
// map-loader.tsx, never directly: Leaflet needs the browser.

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import type { Bbox } from "@/lib/api-types"
import { flyToZoom, mapTiles, mapView } from "@/lib/config"
import "./leaflet-map.css"

// A status token from globals.css: `--status-high` and so on.
export type PinTone = "high" | "medium" | "low" | "done" | "neutral"

export type MapPin = {
  id: number
  lat: number
  lon: number
  tone: PinTone
  // Hover text, in words.
  label: string
}

// Ask the map to fly to a point. `seq` changes on every request, so flying
// to the same point twice still moves the map.
export type MapFocus = { lat: number; lon: number; seq: number }

// Fit the map once to these points, keeping them clear of the floating
// panels: `padding` is [top, right, bottom, left] in pixels.
export type MapFit = { points: [number, number][]; padding: [number, number, number, number] }

// Ask the map to zoom one step in (+1) or out (-1); `seq` changes each time.
export type MapZoom = { delta: 1 | -1; seq: number }

type Props = {
  pins: MapPin[]
  // Called with the visible area on load and after every pan or zoom.
  onViewChange: (bbox: Bbox) => void
  onPinClick?: (id: number) => void
  // Drawn with a halo, so the open defect stands out.
  selectedId?: number | null
  focus?: MapFocus | null
  // Zoom comes from the page's own buttons; Leaflet's control is not shown.
  zoom?: MapZoom | null
  // First-load fit; applied once, when it first arrives.
  fit?: MapFit | null
}

function applyFit(map: L.Map, fit: MapFit) {
  const [top, right, bottom, left] = fit.padding
  map.fitBounds(L.latLngBounds(fit.points), {
    paddingTopLeft: [left, top],
    paddingBottomRight: [right, bottom],
    maxZoom: flyToZoom,
  })
}

function toBbox(bounds: L.LatLngBounds): Bbox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
}

export default function LeafletMap({ pins, onViewChange, onPinClick, selectedId, focus, zoom, fit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const pinLayerRef = useRef<L.LayerGroup | null>(null)
  const onViewChangeRef = useRef(onViewChange)
  const onPinClickRef = useRef(onPinClick)
  // A focus asked for before the map exists (for example from ?defect=):
  // applied when the map is created.
  const focusRef = useRef(focus)
  const fitRef = useRef(fit)
  // The first-load fit happens once only.
  const fitted = useRef(false)

  useEffect(() => {
    onViewChangeRef.current = onViewChange
    onPinClickRef.current = onPinClick
    focusRef.current = focus
    fitRef.current = fit
  }, [onViewChange, onPinClick, focus, fit])

  useEffect(() => {
    const map = L.map(containerRef.current!, {
      center: mapView.center,
      zoom: mapView.zoom,
      minZoom: mapView.minZoom,
      maxZoom: mapView.maxZoom,
      zoomControl: false,
    })
    L.tileLayer(mapTiles.url, {
      attribution: mapTiles.attribution,
      maxZoom: mapView.maxZoom,
    }).addTo(map)
    pinLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const pending = focusRef.current
    const pendingFit = fitRef.current
    if (pending) map.setView([pending.lat, pending.lon], flyToZoom)
    else if (pendingFit && pendingFit.points.length > 0) {
      fitted.current = true
      applyFit(map, pendingFit)
    }

    const report = () => onViewChangeRef.current(toBbox(map.getBounds()))
    map.on("moveend", report)
    report()

    return () => {
      map.remove()
      mapRef.current = null
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
    const foreground = css.getPropertyValue("--foreground").trim()
    for (const pin of pins) {
      const color = css.getPropertyValue(`--status-${pin.tone}`).trim()
      if (pin.id === selectedId) {
        L.circleMarker([pin.lat, pin.lon], {
          radius: 12,
          color: foreground,
          weight: 2,
          fill: false,
          interactive: false,
        }).addTo(layer)
      }
      // Filled circle with a dark outline, so it reads on any tile.
      const marker = L.circleMarker([pin.lat, pin.lon], {
        radius: 7,
        color: background,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.95,
      })
      marker.bindTooltip(pin.label, {
        direction: "top",
        offset: [0, -8],
        className: "be-map-tooltip",
      })
      marker.on("click", () => onPinClickRef.current?.(pin.id))
      marker.addTo(layer)
    }
  }, [pins, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!fit || !map || fitted.current || fit.points.length === 0) return
    fitted.current = true
    applyFit(map, fit)
  }, [fit])

  useEffect(() => {
    if (!zoom || !mapRef.current) return
    if (zoom.delta > 0) mapRef.current.zoomIn()
    else mapRef.current.zoomOut()
  }, [zoom])

  useEffect(() => {
    if (!focus || !mapRef.current) return
    const map = mapRef.current
    map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), flyToZoom))
  }, [focus])

  return <div ref={containerRef} className="be-map isolate h-full w-full" />
}
