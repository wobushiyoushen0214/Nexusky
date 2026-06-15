import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

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
        <CardHeader className="vault-overview__card-head">
          <div className="vault-overview__card-title">
            <CardTitle className="vault-overview__card-title-text">{title}</CardTitle>
            {subtitle && <CardDescription className="vault-overview__card-subtitle">{subtitle}</CardDescription>}
          </div>
          {action && <div className="vault-overview__card-action">{action}</div>}
        </CardHeader>
        <CardContent className="vault-overview__card-content">
          {children}
        </CardContent>
      </section>
    </Card>
  )
}
