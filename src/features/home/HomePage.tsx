import {
  BusFront,
  Clock3,
  Info,
  LocateFixed,
  MapPin,
  Search,
  Star,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { SearchField } from '../../components/ui/SearchField'
import { DepartureCard } from '../departures/DepartureCard'
import { apiDepartureToDeparture } from '../departures/apiMappers'
import { useDepartureFeed } from '../feed/feedContext'
import {
  compareDepartures,
  formatDistance,
  normaliseSearchText,
} from '../feed/feed.utils'
import { useFavourites } from '../favourites/useFavourites'
import { RouteCard } from '../routes/RouteCard'
import { getRouteSummaries } from '../routes/routeSelectors'
import { StopCard } from '../stops/StopCard'
import { getNearbyStopPlaces, getStopPlaces } from '../stops/stopSelectors'
import { useNearbyStopsQuery } from '../../queries/transportQueries'
import { useRecentItems } from './useRecentItems'

type LocationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; latitude: number; longitude: number }
  | { status: 'error'; message: string }

export default function HomePage() {
  const { feed, isStale } = useDepartureFeed()
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState<LocationState>({ status: 'idle' })
  const { favouriteRoutes, favouriteStops } = useFavourites()
  const { recentRoutes, recentStops } = useRecentItems()

  const routes = useMemo(() => (feed ? getRouteSummaries(feed) : []), [feed])
  const stops = useMemo(() => (feed ? getStopPlaces(feed) : []), [feed])

  const normalisedQuery = normaliseSearchText(query)
  const matchingRoutes = useMemo(() => {
    if (!normalisedQuery) return []
    return routes
      .filter((route) =>
        `${route.routeNumber} ${route.name} ${route.destinations.join(' ')}`
          .toLocaleLowerCase()
          .includes(normalisedQuery),
      )
      .slice(0, 5)
  }, [normalisedQuery, routes])

  const matchingStops = useMemo(() => {
    if (!normalisedQuery) return []
    return stops
      .filter((stop) =>
        `${stop.name} ${stop.locality ?? ''} ${stop.routes.join(' ')}`
          .toLocaleLowerCase()
          .includes(normalisedQuery),
      )
      .slice(0, 6)
  }, [normalisedQuery, stops])

  const favouriteRouteItems = routes.filter((route) =>
    favouriteRoutes.includes(route.routeNumber),
  )
  const favouriteStopItems = stops.filter((stop) =>
    favouriteStops.includes(stop.id),
  )
  const recentRouteItems = recentRoutes
    .map((routeNumber) => routes.find((route) => route.routeNumber === routeNumber))
    .filter((route): route is NonNullable<typeof route> => Boolean(route))
    .slice(0, 4)
  const recentStopItems = recentStops
    .map((stopId) => stops.find((stop) => stop.id === stopId))
    .filter((stop): stop is NonNullable<typeof stop> => Boolean(stop))
    .slice(0, 4)

  const nearbyStops = useMemo(() => {
    if (!feed || location.status !== 'ready') return []
    return getNearbyStopPlaces(
      feed,
      location.latitude,
      location.longitude,
      6,
    )
  }, [feed, location])

  const nearbyDepartures = useMemo(() => {
    const seen = new Set<string>()
    return nearbyStops
      .flatMap(({ place, distanceKm }) =>
        place.departures.map((departure) => ({ departure, place, distanceKm })),
      )
      .filter(({ departure }) => {
        if (seen.has(departure.id)) return false
        seen.add(departure.id)
        return departure.status !== 'cancelled'
      })
      .sort((a, b) => compareDepartures(a.departure, b.departure))
      .slice(0, 5)
  }, [nearbyStops])

  const nearbyLocation =
    location.status === 'ready'
      ? { latitude: location.latitude, longitude: location.longitude }
      : null
  const { data: nearbyApi, error: nearbyApiError } = useNearbyStopsQuery(nearbyLocation)
  const apiNearbyDepartures = useMemo(
    () =>
      nearbyApi?.stops
        .flatMap((stop) =>
          stop.departures.map((rawDeparture) => ({
            departure: apiDepartureToDeparture(stop.stopId, rawDeparture),
            stopName: stop.stopName ?? 'Nearby stop',
            distanceLabel: formatDistance(stop.distanceMeters / 1000),
          })),
        )
        .sort((a, b) => compareDepartures(a.departure, b.departure))
        .slice(0, 5) ?? [],
    [nearbyApi],
  )
  const displayedNearbyDepartures =
    apiNearbyDepartures.length > 0 ? apiNearbyDepartures : nearbyDepartures.map((item) => ({
      departure: item.departure,
      stopName: item.place.name,
      distanceLabel: formatDistance(item.distanceKm),
    }))

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocation({
        status: 'error',
        message: 'Location is not supported by this browser.',
      })
      return
    }

    setLocation({ status: 'loading' })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          status: 'ready',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      () => {
        setLocation({
          status: 'error',
          message: 'Location permission was not available. You can still search by stop name.',
        })
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 },
    )
  }

  if (!feed) return null

  const hasFavourites =
    favouriteRouteItems.length > 0 || favouriteStopItems.length > 0
  const hasRecent = recentRouteItems.length > 0 || recentStopItems.length > 0
  const isSearching = normalisedQuery.length > 0

  return (
    <div className="page page--home">
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">Metro & regional bus prototype</p>
          <h1>When is your bus coming?</h1>
          <p>
            Find the next regional bus near you, see whether it is running late,
            and follow it when a live position is available.
          </p>
        </div>

        <div className="home-search-wrap">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search route, stop or destination"
            label="Search route, stop or destination"
          />

          {isSearching && (
            <div className="search-results" aria-live="polite">
              {matchingRoutes.length > 0 && (
                <section>
                  <h2>Routes</h2>
                  <div className="compact-list">
                    {matchingRoutes.map((route) => (
                      <RouteCard key={route.routeNumber} route={route} compact />
                    ))}
                  </div>
                </section>
              )}

              {matchingStops.length > 0 && (
                <section>
                  <h2>Stops</h2>
                  <div className="compact-list">
                    {matchingStops.map((stop) => (
                      <StopCard key={stop.id} stop={stop} compact />
                    ))}
                  </div>
                </section>
              )}

              {matchingRoutes.length === 0 && matchingStops.length === 0 && (
                <EmptyState icon={Search} title="No matches" compact>
                  <p>Try a route number, stop name or suburb.</p>
                </EmptyState>
              )}
            </div>
          )}
        </div>

        <div className="home-hero__actions">
          <button
            type="button"
            className="secondary-button secondary-button--on-dark"
            onClick={requestLocation}
            disabled={location.status === 'loading'}
          >
            <LocateFixed aria-hidden="true" />
            {location.status === 'loading' ? 'Finding nearby stops…' : 'Stops near me'}
          </button>
          <Link className="secondary-button secondary-button--on-dark" to="/routes">
            <BusFront aria-hidden="true" /> Browse routes
          </Link>
        </div>
      </section>

      {isStale && (
        <div className="inline-notice inline-notice--warning">
          <Clock3 aria-hidden="true" />
          <div>
            <strong>Historical live snapshot</strong>
            <span>
              Relative times show what the feed contained at capture rather than
              current departures.
            </span>
          </div>
        </div>
      )}

      {feed.source.capabilities && (
        <div className="inline-notice">
          <Info aria-hidden="true" />
          <div>
            <strong>Regional coverage</strong>
            <span>
              Regional Myki town buses support live predictions and vehicle
              positions. Regional coaches and remaining regional buses are
              schedule-first until a verified realtime identifier is available.
            </span>
          </div>
        </div>
      )}

      {location.status === 'error' && (
        <div className="inline-notice inline-notice--warning">
          <MapPin aria-hidden="true" />
          <div>
            <strong>Nearby stops unavailable</strong>
            <span>{location.message}</span>
          </div>
        </div>
      )}

      {nearbyApiError && nearbyStops.length > 0 && (
        <p className="api-fallback-note">Showing the last available nearby departure snapshot.</p>
      )}

      {displayedNearbyDepartures.length > 0 && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nearby departures</p>
              <h2>Leaving near you</h2>
            </div>
            <span className="section-heading__hint">Closest stops first</span>
          </div>
          <div className="departure-list">
            {displayedNearbyDepartures.map(({ departure, stopName, distanceLabel }) => (
              <DepartureCard
                key={departure.id}
                departure={departure}
                stopName={`${stopName} · ${distanceLabel}`}
              />
            ))}
          </div>
        </section>
      )}

      {nearbyStops.length > 0 && (
        <section className="content-section content-section--tight">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nearby stops</p>
              <h2>Choose another stop</h2>
            </div>
          </div>
          <div className="card-grid card-grid--stops">
            {nearbyStops.map(({ place, distanceKm }) => (
              <StopCard
                key={place.id}
                stop={place}
                distanceLabel={formatDistance(distanceKm)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">For you</p>
            <h2>Your services</h2>
          </div>
          {hasFavourites && <span className="section-heading__hint">Stored on this device</span>}
        </div>

        {!hasFavourites ? (
          <EmptyState
            icon={Star}
            title="No favourites yet"
            action={<Link className="text-link" to="/routes">Browse routes</Link>}
          >
            <p>
              Star a route or stop and it will appear here for quick access.
            </p>
          </EmptyState>
        ) : (
          <div className="home-columns">
            {favouriteRouteItems.length > 0 && (
              <div>
                <h3 className="subsection-title">Routes</h3>
                <div className="compact-list">
                  {favouriteRouteItems.map((route) => (
                    <RouteCard key={route.routeNumber} route={route} compact />
                  ))}
                </div>
              </div>
            )}

            {favouriteStopItems.length > 0 && (
              <div>
                <h3 className="subsection-title">Stops</h3>
                <div className="compact-list">
                  {favouriteStopItems.map((stop) => (
                    <StopCard key={stop.id} stop={stop} compact />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {hasRecent && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Continue</p>
              <h2>Recently viewed</h2>
            </div>
          </div>

          <div className="home-columns">
            {recentRouteItems.length > 0 && (
              <div className="compact-list">
                {recentRouteItems.map((route) => (
                  <RouteCard key={route.routeNumber} route={route} compact />
                ))}
              </div>
            )}
            {recentStopItems.length > 0 && (
              <div className="compact-list">
                {recentStopItems.map((stop) => (
                  <StopCard key={stop.id} stop={stop} compact />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
