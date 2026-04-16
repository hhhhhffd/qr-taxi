import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { DriverBrief } from '../types'

// Fix default icon issue with vite
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const driverIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div class="text-4xl">🚕</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

interface MapProps {
  center: [number, number]
  zoom?: number
  markers?: Array<{
    id: string
    position: [number, number]
    hint?: string
    icon?: L.Icon | L.DivIcon
  }>
  polyline?: [number, number][]
  driverPosition?: [number, number]
  driverInfo?: DriverBrief | null
  /** Leaflet-ready bounding box [[minLat, minLng], [maxLat, maxLng]] from route API */
  bbox?: [[number, number], [number, number]] | null
}

const COORD_EPSILON = 1e-6

const isSamePoint = (a: [number, number], b: [number, number]): boolean =>
  Math.abs(a[0] - b[0]) < COORD_EPSILON
  && Math.abs(a[1] - b[1]) < COORD_EPSILON

const isSamePoints = (a: [number, number][], b: [number, number][]): boolean => {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    if (!isSamePoint(a[i], b[i])) {
      return false
    }
  }
  return true
}

const isSameBbox = (
  a: [[number, number], [number, number]],
  b: [[number, number], [number, number]],
): boolean => isSamePoint(a[0], b[0]) && isSamePoint(a[1], b[1])

function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap()
  const previousViewRef = useRef<{ center: [number, number], zoom: number } | null>(null)

  useEffect(() => {
    const previousView = previousViewRef.current
    if (previousView && previousView.zoom === zoom && isSamePoint(previousView.center, center)) {
      return
    }

    const mapCenter = map.getCenter()
    const currentMapCenter: [number, number] = [mapCenter.lat, mapCenter.lng]
    const shouldRecenter = !isSamePoint(currentMapCenter, center) || map.getZoom() !== zoom

    if (shouldRecenter) {
      map.setView(center, zoom, { animate: false })
    }

    previousViewRef.current = { center: [center[0], center[1]], zoom }
  }, [center, zoom, map])
  return null
}

function BboxUpdater({ bbox }: { bbox: [[number, number], [number, number]] }) {
  const map = useMap()
  const previousBboxRef = useRef<[[number, number], [number, number]] | null>(null)

  useEffect(() => {
    if (previousBboxRef.current && isSameBbox(previousBboxRef.current, bbox)) {
      return
    }

    map.fitBounds(bbox, { padding: [50, 50], animate: false })
    previousBboxRef.current = [
      [bbox[0][0], bbox[0][1]],
      [bbox[1][0], bbox[1][1]],
    ]
  }, [bbox, map])
  return null
}

function BoundsUpdater({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  const previousPositionsRef = useRef<[number, number][] | null>(null)

  useEffect(() => {
    if (positions.length === 0) {
      return
    }

    if (previousPositionsRef.current && isSamePoints(previousPositionsRef.current, positions)) {
      return
    }

    const bounds = L.latLngBounds(positions)
    map.fitBounds(bounds, { padding: [50, 50], animate: false })
    previousPositionsRef.current = positions.map(([lat, lng]) => [lat, lng] as [number, number])
  }, [positions, map])
  return null
}

export default function Map({ center, zoom = 15, markers = [], polyline, driverPosition, driverInfo, bbox }: MapProps) {
  // Exclude driverPosition from bounds — it updates frequently and causes map to jump
  const boundsPositions = [
    ...markers.map(m => m.position),
    ...(polyline ? polyline : []),
  ]
  const shouldFitBounds = Boolean(bbox) || boundsPositions.length > 1

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={true}
      className="w-full h-full z-0"
      zoomControl={false}
    >
      <TileLayer
        attribution=''
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      {!shouldFitBounds && <MapUpdater center={center} zoom={zoom} />}
      {/* Prefer API bbox for accurate route framing; fall back to position-derived bounds */}
      {bbox ? (
        <BboxUpdater bbox={bbox} />
      ) : (
        boundsPositions.length > 1 && <BoundsUpdater positions={boundsPositions as [number, number][]} />
      )}

      {markers.map(marker => (
        <Marker 
          key={marker.id} 
          position={marker.position} 
          {...(marker.icon ? { icon: marker.icon } : {})}
        >
          {marker.hint && (
            <Popup closeButton={false}>
              <span className="font-medium text-gray-800">{marker.hint}</span>
            </Popup>
          )}
        </Marker>
      ))}

      {polyline && polyline.length > 0 && (
        <Polyline positions={polyline} color="#3b82f6" weight={4} opacity={0.8} />
      )}

      {driverPosition && (
        <Marker position={driverPosition} icon={driverIcon}>
          {driverInfo && (
            <Popup closeButton={false}>
              <div className="text-center font-medium">
                <div>{driverInfo.car_model} {driverInfo.plate}</div>
                <div className="text-gray-500 text-sm">{driverInfo.name}</div>
              </div>
            </Popup>
          )}
        </Marker>
      )}
    </MapContainer>
  )
}
