import * as React from 'react'
import { cn } from '../../lib/utils'
import { Card } from '../ui/card'

export function SettingsSection({
  className,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <Card asChild>
      <section className={cn('settings-section', className)} {...props} />
    </Card>
  )
}
