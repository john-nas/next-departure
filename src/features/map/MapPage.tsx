import { BusFront, MapPinned, Radio } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { RouteBadge } from '../../components/ui/RouteBadge'
import { useDepartureFeed } from '../feed/feedContext'
import { formatDateTime } from '../feed/feed.utils'
import { getLiveVehicles, getRouteSummaries } from '../routes/routeSelectors'
import { getStopPlaces } from '../stops/stopSelectors'
import { useLiveVehiclesQuery } from '../../queries/transportQueries'
import VehicleMap, { type VehicleMapVehicle } from './VehicleMap'

export default function MapPage() {
  const { feed } = useDepartureFeed()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedRoute = searchParams.get('route') ?? ''
  const {
    data: apiResult,
    error: apiQueryError,
  } = useLiveVehiclesQuery(selectedRoute || undefined)

  const routes = useMemo(() => (feed ? getRouteSummaries(feed) : []), [feed])
  const liveVehicles = useMemo(
    () => (feed ? getLiveVehicles(feed, selectedRoute || undefined) : []),
    [feed, selectedRoute],
  )

  if (!feed) return null

  const apiVehicles = apiResult?.vehicles ?? null

  const stopPlaces = getStopPlaces(feed).filter((stop) =>
    selectedRoute ? stop.routes.includes(selectedRoute) : false,
  )

  const vehicleRows =
    apiVehicles !== null
      ? apiVehicles.flatMap((vehicle) => {
          if (vehicle.latitude === null || vehicle.longitude === null) return []
          const snapshotVehicle = liveVehicles.find(
            (item) => item.tripId === vehicle.tripId,
          )
          return [
            {
              tripId: vehicle.tripId,
              routeNumber:
                vehicle.routeNumber ?? vehicle.routeId ?? 'Unknown',
              destination:
                vehicle.destination ?? snapshotVehicle?.destination ?? vehicle.routeName ?? 'Service',
              latitude: vehicle.latitude,
              longitude: vehicle.longitude,
              bearing: vehicle.bearing,
              recordedAt: vehicle.reportedAt ?? new Date().toISOString(),
              nextStopName:
                vehicle.nextStopName ?? snapshotVehicle?.departure.vehicle?.nextStopName,
            },
          ]
        })
      : liveVehicles.flatMap((item) => {
          const vehicle = item.departure.vehicle
          if (!vehicle) return []
          return [
            {
              tripId: item.tripId,
              routeNumber: item.routeNumber,
              destination: item.destination,
              latitude: vehicle.latitude,
              longitude: vehicle.longitude,
              bearing: vehicle.bearing,
              recordedAt: vehicle.recordedAt,
              nextStopName: vehicle.nextStopName,
            },
          ]
        })

  const vehicles: VehicleMapVehicle[] = vehicleRows

  const mapStops = selectedRoute
    ? stopPlaces.map((stop) => ({
        id: stop.id,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
      }))
    : []

  return (
    <div className="page page--map">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Realtime</p>
          <h1>Live vehicle map</h1>
          <p>
            Vehicle markers appear only where GTFS Realtime has supplied a
            position in the current snapshot.
          </p>
        </div>
        <MapPinned className="page-heading__icon" aria-hidden="true" />
      </header>

      <div className="route-filter" aria-label="Filter live map by route">
        <button
          type="button"
          className={!selectedRoute ? 'filter-chip filter-chip--active' : 'filter-chip'}
          onClick={() => setSearchParams({})}
        >
          All live vehicles
        </button>
        {routes.map((route) => (
          <button
            type="button"
            key={route.routeNumber}
            className={
              selectedRoute === route.routeNumber
                ? 'filter-chip filter-chip--active'
                : 'filter-chip'
            }
            onClick={() => setSearchParams({ route: route.routeNumber })}
          >
            {route.routeNumber}
          </button>
        ))}
      </div>

      {apiQueryError && apiVehicles === null && (
        <p className="api-fallback-note">
          Local API unavailable; showing the last snapshot vehicle positions.
        </p>
      )}

      {vehicles.length > 0 ? (
        <div className="map-page-layout">
          <VehicleMap
            stops={mapStops}
            vehicles={vehicles}
            height="min(68vh, 680px)"
          />

          <aside className="live-vehicle-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">On the road</p>
              <h2>{vehicles.length} live vehicle{vehicles.length === 1 ? '' : 's'}</h2>
              </div>
              <Radio aria-hidden="true" />
            </div>

            <div className="live-vehicle-list">
              {vehicleRows.map((vehicle) => {
                return (
                  <Link
                    key={vehicle.tripId}
                    className="live-vehicle-row"
                    to={`/trips/${encodeURIComponent(vehicle.tripId)}`}
                  >
                    <RouteBadge routeNumber={vehicle.routeNumber} />
                    <span>
                      <strong>{vehicle.destination}</strong>
                      <small>
                        {vehicle.nextStopName
                          ? `Next ${vehicle.nextStopName}`
                          : 'Live position available'}
                      </small>
                      <small>Reported {formatDateTime(vehicle.recordedAt)}</small>
                    </span>
                  </Link>
                )
              })}
            </div>
          </aside>
        </div>
      ) : (
        <EmptyState icon={BusFront} title="No live vehicle positions">
          <p>
            The feed can still contain scheduled departures when no vehicles are
            currently publishing positions.
          </p>
        </EmptyState>
      )}
    </div>
  )
}
