import { ChevronRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RouteBadge } from '../../components/ui/RouteBadge'
import { useDepartureFeed } from '../feed/feedContext'
import { dueLabel } from '../feed/feed.utils'
import type { StopPlace } from './stopSelectors'

type StopCardProps = {
  stop: StopPlace
  distanceLabel?: string
  compact?: boolean
}

export function StopCard({ stop, distanceLabel, compact = false }: StopCardProps) {
  const { departureAnchor, isStale } = useDepartureFeed()
  const nextDeparture = stop.departures[0]

  return (
    <Link
      className={compact ? 'stop-card stop-card--compact' : 'stop-card'}
      to={`/stops/${encodeURIComponent(stop.id)}`}
    >
      <span className="stop-card__pin">
        <MapPin aria-hidden="true" />
      </span>

      <span className="stop-card__body">
        <strong>{stop.name}</strong>
        <span className="stop-card__subline">
          {distanceLabel && <span>{distanceLabel}</span>}
          {!distanceLabel && stop.locality && <span>{stop.locality}</span>}
          {nextDeparture && (
            <span>
              Next {dueLabel(nextDeparture, departureAnchor, isStale)}
            </span>
          )}
        </span>
        <span className="stop-card__routes">
          {stop.routes.slice(0, 6).map((routeNumber) => (
            <RouteBadge key={routeNumber} routeNumber={routeNumber} size="small" />
          ))}
        </span>
      </span>

      <ChevronRight className="stop-card__chevron" aria-hidden="true" />
    </Link>
  )
}
