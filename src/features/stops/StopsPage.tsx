import { LocateFixed, MapPin, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { SearchField } from '../../components/ui/SearchField'
import { useDepartureFeed } from '../feed/feedContext'
import { formatDistance, normaliseSearchText } from '../feed/feed.utils'
import { StopCard } from './StopCard'
import { getNearbyStopPlaces, getStopPlaces } from './stopSelectors'

export default function StopsPage() {
  const { feed } = useDepartureFeed()
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const stops = useMemo(() => (feed ? getStopPlaces(feed) : []), [feed])
  const normalisedQuery = normaliseSearchText(query)

  const filteredStops = stops.filter((stop) =>
    !normalisedQuery
      ? true
      : `${stop.name} ${stop.locality ?? ''} ${stop.routes.join(' ')}`
          .toLocaleLowerCase()
          .includes(normalisedQuery),
  )
  const nearbyStops = location
    ? getNearbyStopPlaces(feed!, location.latitude, location.longitude, 12)
    : []
  const nearbyDistanceById = new Map(
    nearbyStops.map((item) => [item.place.id, item.distanceKm]),
  )
  const displayedStops = normalisedQuery
    ? filteredStops
    : location
      ? nearbyStops.map(({ place }) => place)
      : filteredStops.slice(0, 40)

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is not supported by this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude })
        setLocationMessage(null)
      },
      () => setLocationMessage('Location permission was unavailable. Search still works below.'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 },
    )
  }

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Browse</p>
          <h1>Bus stops</h1>
        <p>
            Start nearby or search by name, suburb or route. Same-name platform
            records are grouped into one stop place.
          </p>
        </div>
        <MapPin className="page-heading__icon" aria-hidden="true" />
      </header>

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search stop, suburb or route"
        label="Search bus stops"
      />

      <button type="button" className="secondary-button stops-location-button" onClick={requestLocation}>
        <LocateFixed aria-hidden="true" /> {location ? 'Using your location' : 'Find stops near me'}
      </button>
      {locationMessage && <p className="api-fallback-note">{locationMessage}</p>}

      {displayedStops.length > 0 ? (
        <div className="card-grid card-grid--stops content-section--tight">
          {displayedStops.map((stop) => (
            <StopCard
              key={stop.id}
              stop={stop}
              distanceLabel={location && nearbyDistanceById.has(stop.id)
                ? formatDistance(nearbyDistanceById.get(stop.id) ?? 0)
                : undefined}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={Search} title="No matching stops">
          <p>Try a road name, station, locality or route number.</p>
        </EmptyState>
      )}
      {!normalisedQuery && !location && filteredStops.length > displayedStops.length && (
        <p className="section-heading__hint stops-directory-note">
          Showing the first {displayedStops.length} stops. Search to find another, or use your location.
        </p>
      )}
    </div>
  )
}
