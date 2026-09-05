import { ArrowLeftRight, Star } from 'lucide-react'
import { RouteBadge } from '../../components/ui/RouteBadge'
import { IconButton } from '../../components/ui/IconButton'
import type { RoutePattern, RouteSummary } from './routeSelectors'

type RouteHeaderProps = {
  route: RouteSummary
  patterns: RoutePattern[]
  selectedDestination: string
  onDestinationChange: (destination: string) => void
  favourite: boolean
  onToggleFavourite: () => void
}

export function RouteHeader({
  route,
  patterns,
  selectedDestination,
  onDestinationChange,
  favourite,
  onToggleFavourite,
}: RouteHeaderProps) {
  return (
    <section className="route-hero">
      <div className="route-hero__topline">
        <RouteBadge routeNumber={route.routeNumber} size="large" />
        <IconButton
          icon={Star}
          label={favourite ? 'Remove route from favourites' : 'Add route to favourites'}
          active={favourite}
          onClick={onToggleFavourite}
        />
      </div>

      <h1>{route.name}</h1>
      <p>
        Choose a direction to see the next services and any buses currently on
        the road.
      </p>

      {patterns.length > 0 && (
        <div className="direction-picker" aria-label="Choose service direction">
          <span className="direction-picker__label">
            <ArrowLeftRight aria-hidden="true" />
            Towards
          </span>
          <div className="direction-picker__options">
            {patterns.map((pattern) => (
              <button
                type="button"
                key={pattern.destination}
                className={
                  pattern.destination === selectedDestination
                    ? 'direction-chip direction-chip--active'
                    : 'direction-chip'
                }
                onClick={() => onDestinationChange(pattern.destination)}
              >
                {pattern.destination}
                {pattern.liveVehicleCount > 0 && (
                  <span>{pattern.liveVehicleCount} live</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
