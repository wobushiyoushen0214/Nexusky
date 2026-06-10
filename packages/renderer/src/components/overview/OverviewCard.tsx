import type { ReactNode } from 'react'

interface OverviewCardProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function OverviewCard({ title, subtitle, action, children, className = '' }: OverviewCardProps) {
  return (
    <section className={`vault-overview__card${className ? ` ${className}` : ''}`} aria-label={title}>
      <div className="vault-overview__card-head">
        <div className="vault-overview__card-title">
          <h2>{title}</h2>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {action && <div className="vault-overview__card-action">{action}</div>}
      </div>
      {children}
    </section>
  )
}
