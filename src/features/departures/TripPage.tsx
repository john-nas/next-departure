import {
  ArrowLeft,
  BusFront,
  Clock3,
  Radio,
} from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { RouteBadge } from '../../components/ui/RouteBadge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useDepartureFeed } from '../feed/feedContext'
import type { DepartureStatus } from '../feed/feed.types'
import {
  dueLabel,
  formatClock,
  formatDateTime,
  timingLabel,
} from '../feed/feed.utils'
import { useRecentItems } from '../home/useRecentItems'
import VehicleMap, {
  type VehicleMapStop,
  type VehicleMapVehicle,
} from '../map/VehicleMap'
import { getTripOccurrences } from '../routes/routeSelectors'
import type { ApiTrip } from '../../services/transportApi'
import { useRouteShapeQuery, useTripQuery } from '../../queries/transportQueries'

function apiTripVehicleToVehicle(apiTrip: ApiTrip) {
  const vehicle = apiTrip.vehicle
  if (!vehicle || vehicle.latitude === null || vehicle.longitude === null) return null
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
    nextStopName: undefined,
  }
}

function apiPredictionStatus(delaySeconds: number | null, relationship: number | null): DepartureStatus {
  if (relationship === 1) return 'cancelled'
  if (delaySeconds === null) return 'on-time'
  if (Math.abs(delaySeconds) <= 60) return 'on-time'
  return delaySeconds < 0 ? 'early' : 'delayed'
}

export default function TripPage() {
  const { tripId = '' } = useParams()
  const decodedTripId = decodeURIComponent(tripId)
  const { feed, departureAnchor, isStale } = useDepartureFeed()
  const { rememberRoute } = useRecentItems()
  const { data: apiTrip, error: apiQueryError } = useTripQuery(decodedTripId)
  const { data: tripShape } = useRouteShapeQuery(apiTrip?.route.routeId ?? '')
  const officialShape = tripShape?.shapes[0]?.coordinates.map(
    ([longitude, latitude]) => [latitude, longitude] as [number, number],
  )

  const occurrences = useMemo(
    () => (feed ? getTripOccurrences(feed, decodedTripId) : []),
    [decodedTripId, feed],
  )

  const displayOccurrences = useMemo(() => {
    if (!apiTrip) return occurrences
    const predictions = new Map(
      apiTrip.predictions.map((prediction) => [
        `${prediction.stopId}:${prediction.stopSequence}`,
        prediction,
      ]),
    )
    return occurrences.map((occurrence) => {
      const key = `${occurrence.stop.id}:${occurrence.departure.id.split(':').at(-1)}`
      const prediction = predictions.get(key)
      if (!prediction) return occurrence
      const predictedAt = prediction.departureAt ?? prediction.arrivalAt
      const delaySeconds =
        prediction.departureDelaySeconds ?? prediction.arrivalDelaySeconds
      const scheduledAt =
        predictedAt && delaySeconds !== null && delaySeconds !== undefined
          ? new Date(Date.parse(predictedAt) - delaySeconds * 1000).toISOString()
          : predictedAt
      return {
        ...occurrence,
        departure: {
          ...occurrence.departure,
          scheduledAt,
          predictedAt,
          delaySeconds,
          status: apiPredictionStatus(delaySeconds, prediction.scheduleRelationship),
        },
      }
    })
  }, [apiTrip, occurrences])

  const representativeDeparture = occurrences[0]?.departure
  const firstDisplay = displayOccurrences[0]
  const representativeDisplayDeparture = firstDisplay?.departure
  const displayLiveOccurrence = displayOccurrences
    .filter((occurrence) => occurrence.departure.vehicle)
    .sort((a, b) => {
      const aTime = Date.parse(a.departure.vehicle?.recordedAt ?? '')
      const bTime = Date.parse(b.departure.vehicle?.recordedAt ?? '')
      return bTime - aTime
    })[0]
  const representative = representativeDisplayDeparture ?? representativeDeparture
  const vehicle =
    (apiTrip ? apiTripVehicleToVehicle(apiTrip) : null) ??
    displayLiveOccurrence?.departure.vehicle ??
    null

  useEffect(() => {
    if (representativeDeparture) {
      rememberRoute(representativeDeparture.routeNumber)
    }
  }, [rememberRoute, representativeDeparture])

  if (!feed) return null

  if (!representativeDeparture || !representative) {
    return (
      <div className="page">
        <EmptyState icon={BusFront} title="Service no longer in this snapshot">
          <p>
            Realtime feed windows move forward, so older trip IDs eventually
            disappear. Return to the route to choose another service.
          </p>
        </EmptyState>
      </div>
    )
  }

  const routeNumber = apiTrip?.route.routeNumber ?? representative.routeNumber
  const destination = apiTrip?.headsign ?? representative.destination

  const mapStops: VehicleMapStop[] = displayOccurrences.map((occurrence) => ({
    id: occurrence.stop.id,
    name: occurrence.stop.name,
    latitude: occurrence.stop.latitude,
    longitude: occurrence.stop.longitude,
  }))

  const mapVehicles: VehicleMapVehicle[] = vehicle
    ? [
        {
          tripId: representative.tripId,
          routeNumber,
          destination,
          latitude: vehicle.latitude,
          longitude: vehicle.longitude,
          bearing: vehicle.bearing,
          recordedAt: vehicle.recordedAt,
          nextStopName: vehicle.nextStopName,
        },
      ]
    : []

  const nextStopIndex = vehicle?.nextStopName
    ? displayOccurrences.findIndex(
        (occurrence) => occurrence.stop.name === vehicle.nextStopName,
      )
    : apiTrip?.vehicle?.currentStopId
      ? displayOccurrences.findIndex(
          (occurrence) => occurrence.stop.id === apiTrip.vehicle?.currentStopId,
        )
      : -1

  const currentDeparture =
    nextStopIndex >= 0
      ? displayOccurrences[nextStopIndex]?.departure
      : displayOccurrences.find((occurrence) => {
          const time = Date.parse(
            occurrence.departure.predictedAt ??
              occurrence.departure.scheduledAt ??
              '',
          )
          return Number.isFinite(time) && time >= departureAnchor
        })?.departure ?? representative

  return (
    <div className="page page--trip">
      <Link
        className="back-link"
        to={`/routes/${encodeURIComponent(routeNumber)}`}
      >
        <ArrowLeft aria-hidden="true" /> Route {routeNumber}
      </Link>

      <header className="trip-hero">
        <div className="trip-hero__route">
          <RouteBadge routeNumber={representativeDeparture.routeNumber} size="large" />
        </div>
        <div className="trip-hero__copy">
          <p className="eyebrow">Selected service</p>
          <h1>Towards {destination}</h1>
          <p>{apiTrip?.route.routeName ?? representativeDeparture.routeName}</p>
          <div className="trip-hero__meta">
            <StatusBadge
              status={currentDeparture.status}
              label={timingLabel(currentDeparture)}
            />
            {vehicle && (
              <span className="live-inline live-inline--strong">
                <Radio aria-hidden="true" /> Live bus
              </span>
            )}
          </div>
        </div>
        <div className="trip-hero__time">
          <strong>{dueLabel(currentDeparture, departureAnchor, isStale)}</strong>
          <span>
            {formatClock(
              currentDeparture.predictedAt ?? currentDeparture.scheduledAt,
            )}
          </span>
          {currentDeparture.predictedAt &&
            currentDeparture.predictedAt !== currentDeparture.scheduledAt && (
              <small>Scheduled {formatClock(currentDeparture.scheduledAt)}</small>
            )}
        </div>
      </header>

      {apiQueryError && !apiTrip && (
        <p className="api-fallback-note">
          Local API unavailable; showing trip details from the snapshot.
        </p>
      )}

      <div className="trip-layout">
        <main className="trip-main">
          <section className="surface-card surface-card--map">
            <div className="surface-card__heading">
              <div>
                <p className="eyebrow">Vehicle location</p>
                <h2>{vehicle ? 'Live service map' : 'Live position unavailable'}</h2>
              </div>
              {vehicle && <Radio aria-hidden="true" />}
            </div>
            <VehicleMap
              stops={mapStops}
              vehicles={mapVehicles}
              connectStops={!officialShape}
              shape={officialShape}
              selectedStopId={
                nextStopIndex >= 0 ? occurrences[nextStopIndex]?.stop.id : undefined
              }
              height={420}
            />
            <p className="map-disclaimer">
              {officialShape
                ? 'Orange line follows the official GTFS shape for this route.'
                : 'Official GTFS shape is unavailable; the map connects scheduled stops as a preview.'}
            </p>
            {vehicle && (
              <div className="vehicle-callout">
                <BusFront aria-hidden="true" />
                <div>
                  <strong>
                    {vehicle.nextStopName
                      ? `Next stop: ${vehicle.nextStopName}`
                      : 'Live vehicle position available'}
                  </strong>
                  <span>Updated {formatDateTime(vehicle.recordedAt)}</span>
                </div>
              </div>
            )}
          </section>
        </main>

        <aside className="trip-timetable surface-card">
          <div className="surface-card__heading">
            <div>
              <p className="eyebrow">Timetable</p>
              <h2>Upcoming stops</h2>
            </div>
            <Clock3 aria-hidden="true" />
          </div>

          <ol className="trip-stop-list">
            {displayOccurrences.map((occurrence, index) => {
              const isNext = index === nextStopIndex
              return (
                <li
                  key={`${occurrence.stop.id}-${occurrence.departure.id}`}
                  className={isNext ? 'trip-stop trip-stop--next' : 'trip-stop'}
                >
                  <span className="trip-stop__marker" aria-hidden="true">
                    <span />
                  </span>
                  <Link to={`/stops/${encodeURIComponent(occurrence.stop.id)}`}>
                    <span className="trip-stop__name">
                      <strong>{occurrence.stop.name}</strong>
                      {isNext && <small>Next stop</small>}
                    </span>
                    <span className="trip-stop__time">
                      <strong>
                        {formatClock(
                          occurrence.departure.predictedAt ??
                            occurrence.departure.scheduledAt,
                        )}
                      </strong>
                      {occurrence.departure.predictedAt &&
                        occurrence.departure.predictedAt !==
                          occurrence.departure.scheduledAt && (
                          <small>
                            Sch {formatClock(occurrence.departure.scheduledAt)}
                          </small>
                        )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>

        </aside>
      </div>
    </div>
  )
}
