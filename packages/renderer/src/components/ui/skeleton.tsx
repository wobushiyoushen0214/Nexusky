import * as React from 'react'
import { cn } from '../../lib/utils'
import './ui.css'

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="skeleton" className={cn('ui-skeleton', className)} {...props} />
}
