import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GRAPH_MAINTENANCE_FOCUS_ORDER,
  type GraphMaintenanceFocus,
  type GraphMaintenanceSignals,
} from './graph-types'

interface GraphMaintenanceNudgeProps {
  signals: GraphMaintenanceSignals | null
  focus: GraphMaintenanceFocus
  onSetFocus: (focus: GraphMaintenanceFocus) => void
}

interface GraphMaintenanceNudgeItem {
  focus: Exclude<GraphMaintenanceFocus, 'all'>
  count: number
  label: string
  hint: string
  samples: string[]
}

export function GraphMaintenanceNudge({ signals, focus, onSetFocus }: GraphMaintenanceNudgeProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)

  const items = useMemo<GraphMaintenanceNudgeItem[]>(() => {
    if (!signals) return []
    return GRAPH_MAINTENANCE_FOCUS_ORDER.map((itemFocus) => {
      if (itemFocus === 'orphans') {
        return {
          focus: itemFocus,
          count: signals.orphanNoteCount,
          label: t('graph.maintenance.orphans.label'),
          hint: t('graph.maintenance.orphans.hint'),
          samples: signals.orphanSamples,
        }
      }
      if (itemFocus === 'bridges') {
        return {
          focus: itemFocus,
          count: signals.crossFolderBridgeCount,
          label: t('graph.maintenance.bridges.label'),
          hint: t('graph.maintenance.bridges.hint'),
          samples: signals.crossFolderBridgeSamples,
        }
      }
      return {
        focus: itemFocus,
        count: signals.inferredRelationCount,
        label: t('graph.maintenance.inferred.label'),
        hint: t('graph.maintenance.inferred.hint'),
        samples: signals.inferredRelationSamples,
      }
    })
  }, [signals, t])

  const visibleItems = items.filter((item) => item.count > 0)
  if (visibleItems.length === 0) return null

  const activeItem = focus === 'all' ? null : visibleItems.find((item) => item.focus === focus) ?? null
  const primary = activeItem ?? visibleItems[0]
  const total = visibleItems.reduce((sum, item) => sum + item.count, 0)
  const message = activeItem
    ? t('graph.maintenance.focused', { label: activeItem.label })
    : t('graph.maintenance.suggested', { label: primary.label, count: primary.count })
  const sample = primary.samples[0] || primary.hint

  if (collapsed) {
    return (
      <button
        type="button"
        className="graph-maintenance-nudge-chip"
        title={t('graph.maintenance.expand')}
        aria-label={t('graph.maintenance.expand')}
        onClick={() => setCollapsed(false)}
      >
        <span className="graph-maintenance-nudge-badge"><SparkIcon /></span>
        <span className="graph-maintenance-nudge-chip-count">{total}</span>
      </button>
    )
  }

  return (
    <div className="graph-maintenance-nudge" role="status">
      <div className="graph-maintenance-nudge-main">
        <span className="graph-maintenance-nudge-badge"><SparkIcon /></span>
        <span className="graph-maintenance-nudge-text">
          <span className="graph-maintenance-nudge-title">{message}</span>
          <span className="graph-maintenance-nudge-sample">{sample}</span>
        </span>
      </div>
      <div className="graph-maintenance-nudge-actions">
        {visibleItems.map((item) => (
          <button
            key={item.focus}
            type="button"
            className={`graph-maintenance-pill${focus === item.focus ? ' active' : ''}`}
            title={`${item.hint}${item.samples.length > 0 ? `: ${item.samples.join(', ')}` : ''}`}
            onClick={() => onSetFocus(item.focus)}
          >
            <MaintenanceFocusIcon focus={item.focus} />
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
        {focus !== 'all' && (
          <button
            type="button"
            className="graph-maintenance-icon-button"
            title={t('graph.maintenance.all')}
            aria-label={t('graph.maintenance.all')}
            onClick={() => onSetFocus('all')}
          >
            <ClearFocusIcon />
          </button>
        )}
        <button
          type="button"
          className="graph-maintenance-nudge-collapse"
          title={t('graph.maintenance.collapse')}
          aria-label={t('graph.maintenance.collapse')}
          onClick={() => setCollapsed(true)}
        >
          <MinimizeIcon />
        </button>
      </div>
    </div>
  )
}

function MaintenanceFocusIcon({ focus }: { focus: Exclude<GraphMaintenanceFocus, 'all'> }) {
  if (focus === 'orphans') return <OrphanIcon />
  if (focus === 'bridges') return <BridgeIcon />
  return <InferredIcon />
}

function IconSvg({ children }: { children: ReactNode }) {
  return (
    <svg className="graph-maintenance-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function SparkIcon() {
  return <IconSvg><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></IconSvg>
}

function OrphanIcon() {
  return <IconSvg><circle cx="12" cy="12" r="3" /><path d="M4 12h2" /><path d="M18 12h2" /><path d="M12 4v2" /><path d="M12 18v2" /></IconSvg>
}

function BridgeIcon() {
  return <IconSvg><circle cx="5" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 12h3" /><path d="M14 12h3" /><path d="M10 9l4 6" /><path d="M14 9l-4 6" /></IconSvg>
}

function InferredIcon() {
  return <IconSvg><circle cx="6" cy="12" r="2" /><circle cx="18" cy="12" r="2" /><path d="M8 12h1" /><path d="M12 12h1" /><path d="M15 12h1" /><path d="M12 5l.8 2.2L15 8l-2.2.8L12 11l-.8-2.2L9 8l2.2-.8L12 5z" /></IconSvg>
}

function ClearFocusIcon() {
  return <IconSvg><path d="M18 6L6 18" /><path d="M6 6l12 12" /></IconSvg>
}

function MinimizeIcon() {
  return <IconSvg><path d="M6 12h12" /></IconSvg>
}
