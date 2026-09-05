import { BusFront, ChevronRight, Clock3, Radio } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RouteBadge } from '../../components/ui/RouteBadge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useDepartureFeed } from '../feed/feedContext'
import type { Departure } from '../feed/feed.types'
import {
  dueLabel,
  formatClock,
  isRealtimeDeparture,
  timingLabel,
} from '../feed/feed.utils'

type DepartureCardProps = {
  departure: Departure
  showRoute?: boolean
  stopName?: string
  linkToTrip?: boolean
}

export function DepartureCard({
  departure,
  showRoute = true,
  stopName,
  linkToTrip = true,
}: DepartureCardProps) {
  const { departureAnchor, isStale } = useDepartureFeed()
  const hasPrediction =
    departure.predictedAt !== null &&
    departure.predictedAt !== departure.scheduledAt
  const isRealtime = isRealtimeDeparture(departure)

  const content = (
    <>
      {showRoute && <RouteBadge routeNumber={departure.routeNumber} />}

      <span className="departure-card__body">
        <span className="departure-card__destination">
          <strong>{departure.destination}</strong>
        </span>

        <span className="departure-card__route-name">
          {stopName ? `${departure.routeName} · ${stopName}` : departure.routeName}
        </span>

        <span className="departure-card__meta">
          <StatusBadge
            status={departure.status}
            label={timingLabel(departure)}
          />
          {isRealtime ? (
            <span className="live-inline">
              <Radio aria-hidden="true" /> Live
            </span>
          ) : (
            <span className="timetable-inline">
              <Clock3 aria-hidden="true" /> Timetable
            </span>
          )}
          {departure.vehicle && (
            <span className="live-inline">
              <BusFront aria-hidden="true" /> Bus location
            </span>
          )}
          {hasPrediction && (
            <span className="scheduled-inline">
              Scheduled {formatClock(departure.scheduledAt)}
            </span>
          )}
        </span>
      </span>

      <span className="departure-card__time">
        <strong>{dueLabel(departure, departureAnchor, isStale)}</strong>
        <span>{formatClock(departure.predictedAt ?? departure.scheduledAt)}</span>
      </span>

      {linkToTrip ? (
        <ChevronRight className="departure-card__chevron" aria-hidden="true" />
      ) : (
        departure.vehicle && <BusFront className="departure-card__vehicle" aria-hidden="true" />
      )}
    </>
  )

  if (!linkToTrip) {
    return <article className="departure-card">{content}</article>
  }

  return (
    <Link
      className="departure-card departure-card--link"
      to={`/trips/${encodeURIComponent(departure.tripId)}`}
    >
      {content}
    </Link>
  )
}
