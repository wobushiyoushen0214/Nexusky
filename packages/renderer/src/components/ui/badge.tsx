import * as React from 'react'
import { Slot } from 'radix-ui'
import { cn } from '../../lib/utils'
import './ui.css'

type BadgeVariant = 'default' | 'secondary' | 'outline'

const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: 'ui-badge--default',
  secondary: 'ui-badge--secondary',
  outline: 'ui-badge--outline'
}

export interface BadgeProps extends React.ComponentProps<'span'> {
  asChild?: boolean
  variant?: BadgeVariant
}

export function Badge({
  asChild = false,
  className,
  variant = 'default',
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn('ui-badge', badgeVariantClasses[variant], className)}
      {...props}
    />
  )
}
