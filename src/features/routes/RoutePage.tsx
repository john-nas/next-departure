import { BusFront, MapPinned, Radio, Route as RouteIcon } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { RouteBadge } from '../../components/ui/RouteBadge'
import { useDepartureFeed } from '../feed/feedContext'
import type { Vehicle } from '../feed/feed.types'
import { dueLabel, formatClock } from '../feed/feed.utils'
import { useFavourites } from '../favourites/useFavourites'
import { useRecentItems } from '../home/useRecentItems'
import { DepartureCard } from '../departures/DepartureCard'
import { apiDepartureToDeparture } from '../departures/apiMappers'
import VehicleMap, {
  type VehicleMapStop,
  type VehicleMapVehicle,
} from '../map/VehicleMap'
import { RouteHeader } from './RouteHeader'
import {
  getLiveVehicles,
  getRoutePatterns,
  getRouteStopsForDestination,
  getRouteSummary,
} from './routeSelectors'
import {
  useRouteDetailQuery,
  useRouteVehiclesQuery,
  useRouteShapeQuery,
  useRouteDeparturesQuery,
} from '../../queries/transportQueries'
import type { ApiVehicle } from '../../services/transportApi'

function apiVehicleToVehicle(vehicle: ApiVehicle): Vehicle | null {
  if (vehicle.latitude === null || vehicle.longitude === null) return null
  const statusNames = ['incoming_at', 'stopped_at', 'in_transit_to', 'unknown']
  return {
    latitude: vehicle.latitude,
    longitude: vehicle.longitude,
    bearing: vehicle.bearing,
    recordedAt: vehicle.reportedAt ?? new Date().toISOString(),
    currentStopSequence: vehicle.currentStopSequence,
    currentStatus:
      typeof vehicle.currentStatus === 'number'
        ? statusNames[vehicle.currentStatus] ?? 'unknown'
        : 'unknown',
  }
}

export default function RoutePage() {
  const { routeNumber = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { feed, departureAnchor, isStale } = useDepartureFeed()
  const { isRouteFavourite, toggleRoute } = useFavourites()
  const { rememberRoute } = useRecentItems()
  const decodedRouteNumber = decodeURIComponent(routeNumber)
  const { data: apiRouteDetail } = useRouteDetailQuery(decodedRouteNumber)
  const apiRouteId = apiRouteDetail?.route?.routeId ?? decodedRouteNumber
  const { data: routeShape } = useRouteShapeQuery(apiRouteId)
  const { data: routeDepartures } = useRouteDeparturesQuery(apiRouteId)
  const {
    data: apiResult,
    error: apiQueryError,
  } = useRouteVehiclesQuery(decodedRouteNumber)

  const route = useMemo(
    () => (feed ? getRouteSummary(feed, decodedRouteNumber) : undefined),
    [decodedRouteNumber, feed],
  )
  const patterns = useMemo(
    () => (feed ? getRoutePatterns(feed, decodedRouteNumber) : []),
    [decodedRouteNumber, feed],
  )

  const requestedDestination = searchParams.get('towards')
  const selectedDestination =
    patterns.find((pattern) => pattern.destination === requestedDestination)
      ?.destination ??
    patterns[0]?.destination ??
    ''

  const officialShape = routeShape?.shapes[0]?.coordinates.map(
    ([longitude, latitude]) => [latitude, longitude] as [number, number],
  )
  const boardDepartures = (routeDepartures?.departures ?? []).map((item) =>
    apiDepartureToDeparture(item.stopId ?? item.routeId ?? decodedRouteNumber, item),
  )

  const rows = useMemo(
    () =>
      feed && selectedDestination
        ? getRouteStopsForDestination(
            feed,
            decodedRouteNumber,
            selectedDestination,
          )
        : [],
    [decodedRouteNumber, feed, selectedDestination],
  )

  const liveVehicles = useMemo(() => {
    const snapshotVehicles = feed
      ? getLiveVehicles(feed, decodedRouteNumber).filter(
          (item) => item.destination === selectedDestination,
        )
      : []
    const apiVehicles = apiResult?.routeId === decodedRouteNumber ? apiResult.vehicles : null
    if (apiVehicles === null) return snapshotVehicles

    return apiVehicles.flatMap((apiVehicle) => {
      const vehicle = apiVehicleToVehicle(apiVehicle)
      const snapshot = snapshotVehicles.find(
        (item) => item.tripId === apiVehicle.tripId,
      )
      if (!vehicle || !snapshot) return []
      return [{ ...snapshot, departure: { ...snapshot.departure, vehicle } }]
    })
  }, [apiResult, decodedRouteNumber, feed, selectedDestination])

  useEffect(() => {
    if (route) rememberRoute(route.routeNumber)
  }, [rememberRoute, route])

  if (!feed) return null

  if (!route) {
    const staticRoute = apiRouteDetail?.route
    if (staticRoute) {
      return (
        <div className="page page--route-detail">
          <section className="route-hero">
            <div className="route-hero__topline">
              <RouteBadge routeNumber={staticRoute.routeNumber ?? decodedRouteNumber} size="large" />
            </div>
            <p className="eyebrow">Timetable service</p>
            <h1>{staticRoute.routeName ?? `Route ${decodedRouteNumber}`}</h1>
            <p>This service is part of the schedule network. Live tracking is shown when available.</p>
          </section>
          <section className="surface-card content-section">
            <div className="surface-card__heading">
              <div><p className="eyebrow">Route stops</p><h2>Boarding points</h2></div>
            </div>
            <ol className="route-stop-timeline">
              {(staticRoute.stops ?? []).map((stop, index) => (
                <li key={`${stop.stopId}-${stop.stopSequence}`}>
                  <span className="route-stop-timeline__rail" aria-hidden="true">
                    <span className="route-stop-timeline__dot" />
                    {index < (staticRoute.stops?.length ?? 0) - 1 && <span className="route-stop-timeline__line" />}
                  </span>
                  <Link className="route-stop-timeline__content" to={`/stops/${encodeURIComponent(stop.stopId)}`}>
                    <strong>{stop.stopName ?? stop.stopId}</strong>
                    <span className="timetable-inline">Timetable</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          {(staticRoute.stops?.some((stop) => stop.latitude !== null && stop.longitude !== null) || officialShape) && (
            <section className="surface-card content-section">
              <div className="surface-card__heading">
                <div><p className="eyebrow">Map</p><h2>Official route shape</h2></div>
              </div>
              <VehicleMap
                stops={(staticRoute.stops ?? []).flatMap((stop) =>
                  stop.latitude !== null && stop.longitude !== null
                    ? [{ id: stop.stopId, name: stop.stopName ?? stop.stopId, latitude: stop.latitude, longitude: stop.longitude }]
                    : [],
                )}
                shape={officialShape}
                connectStops={!officialShape}
                height={360}
              />
              <p className="map-disclaimer">
                {officialShape
                  ? 'Orange line follows the official GTFS shape for this service.'
                  : 'Official GTFS shape is unavailable; showing stop coordinates only.'}
              </p>
            </section>
          )}
          {(staticRoute.nextServices?.length ?? 0) > 0 && (
            <section className="surface-card content-section">
              <div className="surface-card__heading">
                <div><p className="eyebrow">Next services</p><h2>Timetable departures</h2></div>
              </div>
              <div className="compact-list">
                {staticRoute.nextServices?.slice(0, 5).map((service) => (
                  <div className="route-schedule-row" key={`${service.tripId}-${service.stopId}`}>
                    <strong>{formatClock(service.scheduledAt)}</strong>
                    <span>{service.destination ?? 'Service'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {boardDepartures.length > 0 && (
            <section className="content-section content-section--tight">
              <div className="surface-card__heading">
                <div><p className="eyebrow">Combined board</p><h2>Next departures</h2></div>
              </div>
              <div className="compact-list">
                {boardDepartures.slice(0, 8).map((departure) => (
                  <DepartureCard key={departure.id} departure={departure} showRoute={false} />
                ))}
              </div>
            </section>
          )}
        </div>
      )
    }
    return (
      <div className="page">
        <EmptyState icon={RouteIcon} title="Route not found">
          <p>This route is not represented in the current departure feed.</p>
        </EmptyState>
      </div>
    )
  }

  const mapStops: VehicleMapStop[] = rows.map((row) => ({
    id: row.stop.id,
    name: row.stop.name,
    latitude: row.stop.latitude,
    longitude: row.stop.longitude,
  }))

  const mapVehicles: VehicleMapVehicle[] = liveVehicles.flatMap((item) => {
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

  const handleDestinationChange = (destination: string) => {
    setSearchParams({ towards: destination })
  }

  return (
    <div className="page page--route-detail">
      <RouteHeader
        route={route}
        patterns={patterns}
        selectedDestination={selectedDestination}
        onDestinationChange={handleDestinationChange}
        favourite={isRouteFavourite(route.routeNumber)}
        onToggleFavourite={() => toggleRoute(route.routeNumber)}
      />

      {apiQueryError && !apiResult && (
        <p className="api-fallback-note">
          Local API unavailable; showing vehicle data from the snapshot.
        </p>
      )}

      <div className="route-detail-layout">
        <main className="route-detail-main">
          <section className="surface-card route-summary-strip">
            <div>
                <span>Stops</span>
                <strong>{rows.length}</strong>
              </div>
              <div>
                <span>Live buses</span>
              <strong>{mapVehicles.length}</strong>
            </div>
            <Link to={`/map?route=${encodeURIComponent(route.routeNumber)}`}>
              <MapPinned aria-hidden="true" /> Open live map
            </Link>
          </section>

          {liveVehicles.length > 0 && (
            <section className="content-section content-section--tight">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Realtime</p>
                  <h2>Live services towards {selectedDestination}</h2>
                </div>
                <Radio aria-hidden="true" />
              </div>

              <div className="live-trip-strip">
                {liveVehicles.map((item) => {
                  const vehicle = item.departure.vehicle
                  if (!vehicle) return null

                  return (
                    <Link
                      key={item.tripId}
                      className="live-trip-card"
                      to={`/trips/${encodeURIComponent(item.tripId)}`}
                    >
                      <BusFront aria-hidden="true" />
                      <span>
                        <strong>
                          {vehicle.nextStopName
                            ? `Next ${vehicle.nextStopName}`
                            : 'Live vehicle'}
                        </strong>
                        <small>Tap for vehicle and timetable</small>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          <section className="content-section content-section--tight">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Service overview</p>
                <h2>Stops towards {selectedDestination}</h2>
              </div>
            </div>

            {rows.length > 0 ? (
              <ol className="route-stop-timeline">
                {rows.map((row, index) => (
                  <li key={`${row.stop.id}-${row.sequence}`}>
                    <span className="route-stop-timeline__rail" aria-hidden="true">
                      <span className="route-stop-timeline__dot" />
                      {index < rows.length - 1 && (
                        <span className="route-stop-timeline__line" />
                      )}
                    </span>

                    <Link
                      className="route-stop-timeline__content"
                      to={`/stops/${encodeURIComponent(row.stop.id)}`}
                    >
                      <span>
                        <strong>{row.stop.name}</strong>
                        {row.stop.locality && <small>{row.stop.locality}</small>}
                      </span>
                      <span className="route-stop-timeline__time">
                        <strong>
                          {dueLabel(row.nextDeparture, departureAnchor, isStale)}
                        </strong>
                        <small>
                          {formatClock(
                            row.nextDeparture.predictedAt ??
                              row.nextDeparture.scheduledAt,
                          )}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon={BusFront} title="No stops in this service pattern" compact>
                <p>Try another destination above.</p>
              </EmptyState>
            )}
          </section>

          {boardDepartures.length > 0 && (
            <section className="content-section content-section--tight">
              <div className="section-heading">
                <div><p className="eyebrow">Combined board</p><h2>Next departures</h2></div>
              </div>
              <div className="compact-list">
                {boardDepartures.slice(0, 8).map((departure) => (
                  <DepartureCard key={departure.id} departure={departure} showRoute={false} />
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="route-detail-map">
          <div className="surface-card surface-card--map">
            <div className="surface-card__heading">
              <div>
                <p className="eyebrow">Map</p>
                <h2>Service and live vehicles</h2>
              </div>
            </div>
            <VehicleMap
              stops={mapStops}
              vehicles={mapVehicles}
              connectStops={!officialShape}
              shape={officialShape}
              height={460}
            />
            <p className="map-disclaimer">
              {officialShape
                ? 'Orange line follows the official GTFS shape for this service.'
                : 'Official GTFS shape is not available for this route; the line connects stop coordinates as a preview.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
