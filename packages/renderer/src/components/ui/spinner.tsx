import * as React from 'react'
import { cn } from '../../lib/utils'
import './ui.css'

export function Spinner({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="spinner" className={cn('ui-spinner', className)} {...props} />
}
