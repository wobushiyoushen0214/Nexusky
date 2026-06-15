import type { ReactNode } from 'react'
import { Card } from '../ui/card'

interface OverviewCardProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function OverviewCard({ title, subtitle, action, children, className = '' }: OverviewCardProps) {
  return (
    <Card asChild className={`vault-overview__card${className ? ` ${className}` : ''}`}>
      <section aria-label={title}>
        <div className="vault-overview__card-head">
          <div className="vault-overview__card-title">
            <h2>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          {action && <div className="vault-overview__card-action">{action}</div>}
        </div>
        {children}
      </section>
    </Card>
  )
}
