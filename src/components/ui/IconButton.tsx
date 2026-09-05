import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  active?: boolean
}

export function IconButton({
  icon: Icon,
  label,
  active = false,
  className,
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={clsx('icon-button', active && 'icon-button--active', className)}
      aria-label={label}
      aria-pressed={active || undefined}
      {...buttonProps}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}
