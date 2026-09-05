import clsx from 'clsx'

type RouteBadgeProps = {
  routeNumber: string
  size?: 'small' | 'medium' | 'large'
}

export function RouteBadge({
  routeNumber,
  size = 'medium',
}: RouteBadgeProps) {
  return (
    <span
      className={clsx('route-badge', `route-badge--${size}`)}
      aria-label={`Route ${routeNumber}`}
    >
      {routeNumber}
    </span>
  )
}
