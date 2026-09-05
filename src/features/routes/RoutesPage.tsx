import { BusFront, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { SearchField } from '../../components/ui/SearchField'
import { useDepartureFeed } from '../feed/feedContext'
import { normaliseSearchText } from '../feed/feed.utils'
import { useFavourites } from '../favourites/useFavourites'
import { RouteCard } from './RouteCard'
import { getRouteSummaries } from './routeSelectors'
import { useRoutesQuery } from '../../queries/transportQueries'

export default function RoutesPage() {
  const { feed } = useDepartureFeed()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'relevant' | 'live' | 'favourites' | 'all'>('relevant')
  const [visibleLimit, setVisibleLimit] = useState(24)
  const { favouriteRoutes } = useFavourites()
  const normalisedQuery = normaliseSearchText(query)
  const snapshotRoutes = useMemo(() => (feed ? getRouteSummaries(feed) : []), [feed])
  const { data: apiRoutes } = useRoutesQuery(normalisedQuery || undefined)
  const routes = useMemo(() => {
    if (!apiRoutes) return snapshotRoutes
    const snapshotByNumber = new Map(snapshotRoutes.map((route) => [route.routeNumber, route]))
    const merged = new Map<string, (typeof snapshotRoutes)[number]>()
    for (const apiRoute of apiRoutes.routes) {
      const routeNumber = apiRoute.routeNumber ?? apiRoute.routeId
      const existing = snapshotByNumber.get(routeNumber)
      if (existing) {
        merged.set(routeNumber, existing)
      } else if (!merged.has(routeNumber)) {
        merged.set(routeNumber, {
          routeNumber,
          routeIds: [apiRoute.routeId],
          name: apiRoute.routeName ?? `Route ${routeNumber}`,
          destinations: [],
          stopIds: [],
          liveVehicleCount: 0,
          regionalLive: false,
          departureCount: 0,
          nextDeparture: null,
        })
      }
    }
    for (const snapshotRoute of snapshotRoutes) {
      const matches = !normalisedQuery ||
        `${snapshotRoute.routeNumber} ${snapshotRoute.name} ${snapshotRoute.destinations.join(' ')}`
          .toLocaleLowerCase()
          .includes(normalisedQuery)
      if (matches) merged.set(snapshotRoute.routeNumber, snapshotRoute)
    }
    return [...merged.values()]
  }, [apiRoutes, normalisedQuery, snapshotRoutes])

  const filteredRoutes = routes
    .filter((route) =>
      !normalisedQuery
        ? true
        : `${route.routeNumber} ${route.name} ${route.destinations.join(' ')}`
            .toLocaleLowerCase()
            .includes(normalisedQuery),
    )
    .filter((route) => {
      if (scope === 'live') return route.liveVehicleCount > 0
      if (scope === 'favourites') return favouriteRoutes.includes(route.routeNumber)
      return true
    })
    .sort((a, b) => {
      if (scope === 'relevant' && !normalisedQuery) {
        return (
          Number(b.liveVehicleCount > 0) - Number(a.liveVehicleCount > 0) ||
          Number(favouriteRoutes.includes(b.routeNumber)) -
            Number(favouriteRoutes.includes(a.routeNumber)) ||
          a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true })
        )
      }
      return a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true })
    })

  const displayedRoutes = !normalisedQuery && scope === 'relevant'
    ? filteredRoutes.slice(0, 24)
    : filteredRoutes.slice(0, visibleLimit)

  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Browse</p>
          <h1>Bus routes</h1>
        <p>
            Search for a route or destination, or start with services running now.
          </p>
        </div>
        <BusFront className="page-heading__icon" aria-hidden="true" />
      </header>

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search route number or destination"
        label="Search bus routes"
      />

      <div className="filter-tabs" aria-label="Route list filter">
        {([
          ['relevant', 'Recommended'],
          ['live', 'Live now'],
          ['favourites', 'Favourites'],
          ['all', 'All routes'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={scope === value ? 'filter-tab filter-tab--active' : 'filter-tab'}
            onClick={() => setScope(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {displayedRoutes.length > 0 ? (
        <div className="card-grid card-grid--routes content-section--tight">
          {displayedRoutes.map((route) => (
            <RouteCard key={route.routeNumber} route={route} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Search} title="No matching routes">
          <p>Try another route number or destination.</p>
        </EmptyState>
      )}
      {filteredRoutes.length > displayedRoutes.length && (
        <button
          type="button"
          className="secondary-button route-directory-more"
          onClick={() => {
            if (!normalisedQuery && scope === 'relevant') setScope('all')
            setVisibleLimit((limit) => limit + 24)
          }}
        >
          {!normalisedQuery && scope === 'relevant'
            ? `Browse all ${filteredRoutes.length} routes`
            : `Show ${Math.min(24, filteredRoutes.length - displayedRoutes.length)} more routes`}
        </button>
      )}
    </div>
  )
}
