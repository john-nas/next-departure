import { BusFront, ChevronRight, Radio } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RouteBadge } from '../../components/ui/RouteBadge'
import { useDepartureFeed } from '../feed/feedContext'
import { dueLabel, formatClock, isRealtimeDeparture } from '../feed/feed.utils'
import type { RouteSummary } from './routeSelectors'

type RouteCardProps = {
  route: RouteSummary
  compact?: boolean
}

export function RouteCard({ route, compact = false }: RouteCardProps) {
  const { departureAnchor, isStale } = useDepartureFeed()
  const next = route.nextDeparture
  return (
    <Link
      className={compact ? 'route-card route-card--compact' : 'route-card'}
      to={`/routes/${encodeURIComponent(route.routeNumber)}`}
    >
      <RouteBadge routeNumber={route.routeNumber} size={compact ? 'medium' : 'large'} />

      <span className="route-card__body">
        <strong>{route.name}</strong>
        <span className="route-card__meta">
          {next && (
            <span className="route-card__next">
              Next {dueLabel(next, departureAnchor, isStale)} · {next.destination}
            </span>
          )}
          {route.liveVehicleCount > 0 && (
            <span className="route-card__live">
              <Radio aria-hidden="true" />
              {route.liveVehicleCount} live {route.liveVehicleCount === 1 ? 'bus' : 'buses'}
            </span>
          )}
          {next && !isRealtimeDeparture(next) && (
            <span className="timetable-inline">Timetable · {formatClock(next.scheduledAt)}</span>
          )}
          {!next && <span><BusFront aria-hidden="true" /> No upcoming service</span>}
        </span>
      </span>

      <ChevronRight className="route-card__chevron" aria-hidden="true" />
    </Link>
  )
}
