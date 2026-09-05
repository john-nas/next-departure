import clsx from 'clsx'
import type { DepartureStatus } from '../../features/feed/feed.types'

type StatusBadgeProps = {
  status: DepartureStatus
  label: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={clsx('status-badge', `status-badge--${status}`)}>
      {label}
    </span>
  )
}
