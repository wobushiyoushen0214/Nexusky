import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from '../../lib/utils'
import './ui.css'

export function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const numericValue = typeof value === 'number' ? value : 0
  const numericMax = typeof max === 'number' && max > 0 ? max : 100
  const percent = Math.max(0, Math.min(100, (numericValue / numericMax) * 100))

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('ui-progress', className)}
      value={value}
      max={max}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="ui-progress-indicator"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
