import * as React from 'react'
import { cn } from '../../lib/utils'
import './ui.css'

type AlertVariant = 'default' | 'destructive'

const alertVariantClasses: Record<AlertVariant, string> = {
  default: 'ui-alert--default',
  destructive: 'ui-alert--destructive',
}

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
}

export function Alert({
  className,
  role = 'alert',
  variant = 'default',
  ...props
}: AlertProps) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={role}
      className={cn('ui-alert', alertVariantClasses[variant], className)}
      {...props}
    />
  )
}

export function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="alert-title" className={cn('ui-alert-title', className)} {...props} />
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="alert-description" className={cn('ui-alert-description', className)} {...props} />
}
