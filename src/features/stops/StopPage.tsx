import { MapPin, Star } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { IconButton } from '../../components/ui/IconButton'
import { RouteBadge } from '../../components/ui/RouteBadge'
import { DepartureList } from '../departures/DepartureList'
import { useDepartureFeed } from '../feed/feedContext'
import { useFavourites } from '../favourites/useFavourites'
import { useRecentItems } from '../home/useRecentItems'
import VehicleMap from '../map/VehicleMap'
import { getStopPlaceById } from './stopSelectors'
import { apiDepartureToDeparture } from '../departures/apiMappers'
import { useStopDeparturesQuery } from '../../queries/transportQueries'

export default function StopPage() {
  const { stopId = '' } = useParams()
  const decodedStopId = decodeURIComponent(stopId)
  const { feed } = useDepartureFeed()
  const { isStopFavourite, toggleStop } = useFavourites()
  const { rememberStop } = useRecentItems()

  const stop = feed ? getStopPlaceById(feed, decodedStopId) : undefined
  const representativeStopId = stop?.stopIds[0]
  const {
    data: apiResult,
    error: apiQueryError,
  } = useStopDeparturesQuery(representativeStopId ?? '')

  useEffect(() => {
    if (stop) rememberStop(stop.id)
  }, [rememberStop, stop])

  if (!feed) return null

  const apiDepartures = representativeStopId && apiResult
    ? apiResult.departures.map((departure) =>
        apiDepartureToDeparture(representativeStopId, departure),
      )
    : null
  const departures = apiDepartures ?? stop?.departures ?? []

  if (!stop) {
    return (
      <div className="page">
        <EmptyState icon={MapPin} title="Stop not found">
          <p>This stop is not represented in the current departure feed.</p>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="page page--stop-detail">
      <header className="stop-hero">
        <div className="stop-hero__pin">
          <MapPin aria-hidden="true" />
        </div>
        <div className="stop-hero__copy">
          <p className="eyebrow">Bus stop</p>
          <h1>{stop.name}</h1>
          {stop.locality && <p>{stop.locality}</p>}
          <div className="stop-hero__routes">
            {stop.routes.map((routeNumber) => (
              <Link
                key={routeNumber}
                to={`/routes/${encodeURIComponent(routeNumber)}`}
              >
                <RouteBadge routeNumber={routeNumber} />
              </Link>
            ))}
          </div>
        </div>
        <IconButton
          icon={Star}
          label={
            isStopFavourite(stop.id)
              ? 'Remove stop from favourites'
              : 'Add stop to favourites'
          }
          active={isStopFavourite(stop.id)}
          onClick={() => toggleStop(stop.id)}
        />
      </header>

      <div className="stop-detail-layout">
        <main>
          <section className="surface-card">
            <div className="surface-card__heading">
              <div>
                <p className="eyebrow">Next departures</p>
                <h2>Next {Math.min(5, departures.length)} services</h2>
              </div>
            </div>
            {apiQueryError && !apiResult && (
              <p className="api-fallback-note">
                Local API unavailable; showing departures from the snapshot.
              </p>
            )}
            <DepartureList departures={departures.slice(0, 5)} />
          </section>
        </main>

        <aside className="stop-detail-aside">
          <section className="surface-card surface-card--map">
            <div className="surface-card__heading">
              <div>
                <p className="eyebrow">Location</p>
                <h2>Stop map</h2>
              </div>
            </div>
            <VehicleMap
              stops={[
                {
                  id: stop.id,
                  name: stop.name,
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                },
              ]}
              selectedStopId={stop.id}
              height={300}
            />
          </section>

          <p className="map-disclaimer">
            Use the stop map to confirm the boarding location. Departure times
            are marked Live when the feed includes a current prediction.
          </p>
        </aside>
      </div>
    </div>
  )
}
