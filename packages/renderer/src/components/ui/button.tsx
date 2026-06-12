import * as React from 'react'
import { Slot } from 'radix-ui'
import { cn } from '../../lib/utils'
import './ui.css'

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
type ButtonSize = 'default' | 'sm' | 'xs' | 'icon'

const buttonVariantClasses: Record<ButtonVariant, string> = {
  default: 'ui-button--default',
  secondary: 'ui-button--secondary',
  outline: 'ui-button--outline',
  ghost: 'ui-button--ghost',
  destructive: 'ui-button--destructive'
}

const buttonSizeClasses: Record<ButtonSize, string> = {
  default: 'ui-button--default-size',
  sm: 'ui-button--sm',
  xs: 'ui-button--xs',
  icon: 'ui-button--icon'
}

export interface ButtonProps extends React.ComponentProps<'button'> {
  asChild?: boolean
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  asChild = false,
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn('ui-button', buttonVariantClasses[variant], buttonSizeClasses[size], className)}
      {...props}
    />
  )
}
