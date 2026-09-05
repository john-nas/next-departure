import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={compact ? 'empty-state empty-state--compact' : 'empty-state'}>
      <span className="empty-state__icon">
        <Icon aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      {children && <div className="empty-state__copy">{children}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
