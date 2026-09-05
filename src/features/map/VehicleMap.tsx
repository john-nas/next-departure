import { divIcon, type LatLngBoundsExpression } from 'leaflet'
import { useEffect, useMemo } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import { formatDateTime } from '../feed/feed.utils'

export type VehicleMapStop = {
  id: string
  name: string
  latitude: number
  longitude: number
}

export type VehicleMapVehicle = {
  tripId: string
  routeNumber: string
  destination: string
  latitude: number
  longitude: number
  bearing: number | null
  recordedAt: string
  nextStopName?: string
}

type VehicleMapProps = {
  stops?: VehicleMapStop[]
  vehicles?: VehicleMapVehicle[]
  selectedStopId?: string
  connectStops?: boolean
  /** Official GTFS shape coordinates as [latitude, longitude]. */
  shape?: Array<[number, number]>
  height?: number | string
  className?: string
}

export default function VehicleMap({
  stops = [],
  vehicles = [],
  selectedStopId,
  connectStops = false,
  shape,
  height = 360,
  className,
}: VehicleMapProps) {
  const points = useMemo(
    () => [
      ...stops.map((stop) => [stop.latitude, stop.longitude] as [number, number]),
      ...(shape ?? []).map((point) => [point[0], point[1]] as [number, number]),
      ...vehicles.map(
        (vehicle) => [vehicle.latitude, vehicle.longitude] as [number, number],
      ),
    ],
    [shape, stops, vehicles],
  )

  if (points.length === 0) {
    return (
      <div className="map-empty" style={{ height }}>
        No map positions are available in this feed snapshot.
      </div>
    )
  }

  const centre = points[0]
  const bounds = points as LatLngBoundsExpression

  return (
    <div className={className ? `vehicle-map ${className}` : 'vehicle-map'} style={{ height }}>
      <MapContainer
        center={centre}
        zoom={13}
        scrollWheelZoom
        className="vehicle-map__canvas"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitMapBounds bounds={bounds} />

        {shape && shape.length > 1 ? (
          <Polyline
            positions={shape}
            pathOptions={{ color: '#ef8b17', weight: 4, opacity: 0.86 }}
          />
        ) : connectStops && stops.length > 1 ? (
          <Polyline
            positions={stops.map((stop) => [stop.latitude, stop.longitude])}
            pathOptions={{ color: '#ef8b17', weight: 4, opacity: 0.82 }}
          />
        ) : null}

        {stops.map((stop) => {
          const selected = stop.id === selectedStopId
          return (
            <CircleMarker
              key={stop.id}
              center={[stop.latitude, stop.longitude]}
              radius={selected ? 8 : 5}
              pathOptions={{
                color: selected ? '#172733' : '#ef8b17',
                fillColor: '#ffffff',
                fillOpacity: 1,
                weight: selected ? 4 : 3,
              }}
            >
              <Popup>{stop.name}</Popup>
            </CircleMarker>
          )
        })}

        {vehicles.map((vehicle) => (
          <Marker
            key={vehicle.tripId}
            position={[vehicle.latitude, vehicle.longitude]}
            icon={busIcon(vehicle.routeNumber, vehicle.bearing)}
          >
            <Popup>
              <strong>Route {vehicle.routeNumber}</strong>
              <br />
              Towards {vehicle.destination}
              {vehicle.nextStopName && (
                <>
                  <br />Next {vehicle.nextStopName}
                </>
              )}
              <br />
              Reported {formatDateTime(vehicle.recordedAt)}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

function FitMapBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 })
  }, [bounds, map])

  return null
}

function busIcon(routeNumber: string, bearing: number | null) {
  const rotation = bearing === null ? 0 : bearing
  return divIcon({
    className: 'live-bus-marker-shell',
    html: `<div class="live-bus-marker" style="--bearing:${rotation}deg"><span>${escapeHtml(routeNumber)}</span></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
