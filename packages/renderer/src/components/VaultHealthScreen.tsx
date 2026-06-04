import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { VaultHealthSummary } from '@shared/types/ipc'
import { useVaultStore } from '../stores/vault-store'
import { useUIStore } from '../stores/ui-store'
import { queueAiCommandDraft, type AICommandDraft } from './ai/ai-command-draft'

type VaultHealthNextStepId =
  | 'askAi'
  | 'fixLinks'
  | 'reviewStructure'
  | 'reviewTasks'
  | 'reviewMemory'
  | 'reviewStale'
  | 'openMaintenance'
  | 'browseGraph'

interface VaultHealthNextStep {
  id: VaultHealthNextStepId
  count?: number
  priority: number
}

interface VaultHealthScreenProps {
  vaultPath: string
  onDismiss: () => void
}

export function buildVaultHealthAskAiDraft(t: TFunction, summary: VaultHealthSummary | null): AICommandDraft {
  return {
    mode: 'chat',
    agentMode: false,
    prompt: t('vaultHealth.action.askAi.prompt', {
      notes: summary?.noteCount ?? 0,
      links: summary?.linkCount ?? 0,
      unresolved: summary?.unresolvedLinkCount ?? 0,
      orphans: summary?.orphanCount ?? 0,
      tasks: summary?.openTaskCount ?? 0,
      missingMemory: summary?.missingMemoryCount ?? 0
    })
  }
}

export function buildVaultHealthNextSteps(summary: VaultHealthSummary): VaultHealthNextStep[] {
  const factorImpact = new Map(summary.scoreFactors.map((factor) => [factor.id, factor.impact]))
  const signalSteps: VaultHealthNextStep[] = []
  const addSignal = (
    id: VaultHealthNextStepId,
    count: number,
    factorId: 'links' | 'tasks' | 'memory' | 'structure' | 'freshness'
  ) => {
    if (count <= 0) return
    signalSteps.push({
      id,
      count,
      priority: (factorImpact.get(factorId) ?? 0) * 1000 + count
    })
  }

  addSignal('fixLinks', summary.unresolvedLinkCount, 'links')
  addSignal('reviewStructure', summary.orphanCount + summary.duplicateTitleCount, 'structure')
  addSignal('reviewTasks', summary.openTaskCount, 'tasks')
  addSignal('reviewMemory', summary.missingMemoryCount, 'memory')
  addSignal('reviewStale', summary.staleNoteCount, 'freshness')

  const sortedSignals = signalSteps.sort((a, b) => b.priority - a.priority).slice(0, 3)
  const fallbackSteps: VaultHealthNextStep[] = [
    { id: 'askAi', priority: 0 },
    { id: 'browseGraph', priority: 0 },
    { id: 'openMaintenance', priority: 0 }
  ]
  return [...sortedSignals, ...fallbackSteps.filter((step) => !sortedSignals.some((signal) => signal.id === step.id))]
    .slice(0, 3)
}

export function VaultHealthScreen({ vaultPath, onDismiss }: VaultHealthScreenProps) {
  const { t } = useTranslation()
  const setRightPanel = useUIStore((s) => s.setRightPanel)
  const setMainView = useUIStore((s) => s.setMainView)
  const setMaintenancePanelSection = useUIStore((s) => s.setMaintenancePanelSection)
  const refreshFiles = useVaultStore((s) => s.refreshFiles)
  const [summary, setSummary] = useState<VaultHealthSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSummary(null)
    setError(null)
    ;(async () => {
      try {
        await refreshFiles()
        const result = await window.api.invoke('vault:health-scan', { vaultPath })
        if (!cancelled) setSummary(result)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vaultPath, refreshFiles])

  const dismiss = async () => {
    try {
      await window.api.invoke('vault:health-mark-shown', { vaultPath })
    } catch {}
    onDismiss()
  }

  const askAi = async () => {
    queueAiCommandDraft(buildVaultHealthAskAiDraft(t, summary), () => setRightPanel('chat'))
    await dismiss()
  }

  const openMaintenance = async () => {
    setMaintenancePanelSection('queue')
    setRightPanel('maintenance')
    await dismiss()
  }

  const openGraph = async () => {
    setMainView('graph')
    await dismiss()
  }

  const repairSignalCount = summary
    ? summary.unresolvedLinkCount + summary.orphanCount + summary.duplicateTitleCount
    : 0
  const scoreDragFactors = summary
    ? summary.scoreFactors.filter((factor) => factor.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 3)
    : []
  const nextSteps = summary ? buildVaultHealthNextSteps(summary) : []

  const runNextStep = async (id: VaultHealthNextStepId) => {
    if (id === 'askAi') {
      await askAi()
      return
    }
    if (id === 'browseGraph') {
      await openGraph()
      return
    }
    await openMaintenance()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)', padding: '56px 32px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: 4 }}>
              {t('vaultHealth.title')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
              {t('vaultHealth.subtitle')}
            </p>
          </div>
          <button
            onClick={dismiss}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            {t('vaultHealth.skip')}
          </button>
        </div>

        {error && (
          <StatePanel
            title={t('vaultHealth.state.error.title')}
            desc={`${t('vaultHealth.state.error.desc')} ${error}`}
            tone="error"
          />
        )}

        {!summary && !error && (
          <StatePanel
            title={t('vaultHealth.state.scanning.title')}
            desc={t('vaultHealth.state.scanning.desc')}
          />
        )}

        {summary && (
          <>
            <div
              style={{
                padding: '18px 20px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                marginBottom: 16
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('vaultHealth.hero.kicker')}
              </div>
              <h2 style={{ fontSize: 18, lineHeight: 1.35, color: 'var(--text-primary)', margin: 0, marginBottom: 8 }}>
                {repairSignalCount > 0
                  ? t('vaultHealth.hero.titleWithWork', { count: repairSignalCount })
                  : t('vaultHealth.hero.title')}
              </h2>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0, maxWidth: 640 }}>
                {t('vaultHealth.hero.body')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                <SignalLabel>{t('vaultHealth.hero.signal.local')}</SignalLabel>
                <SignalLabel>{t('vaultHealth.hero.signal.review')}</SignalLabel>
                <SignalLabel>{t('vaultHealth.hero.signal.context')}</SignalLabel>
              </div>
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) minmax(0, 1fr)', gap: 14, alignItems: 'stretch' }}>
                <div style={{ padding: '12px 14px', border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-base)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{t('vaultHealth.score.label')}</div>
                  <div style={{ fontSize: 32, lineHeight: 1, fontWeight: 700, color: 'var(--text-primary)' }}>{summary.score}</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>{t('vaultHealth.score.outOf')}</div>
                </div>
                <div style={{ minWidth: 0, padding: '12px 14px', border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-base)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>{t('vaultHealth.score.why')}</div>
                  {scoreDragFactors.length > 0 ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {scoreDragFactors.map((factor) => (
                        <div key={factor.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center', fontSize: 12 }}>
                          <span style={{ minWidth: 0, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t(`vaultHealth.score.factor.${factor.id}`)}
                          </span>
                          <span style={{ color: factor.status === 'bad' ? '#f87171' : '#f59e0b', fontWeight: 600 }}>
                            {t('vaultHealth.score.impact', { impact: factor.impact })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('vaultHealth.score.noIssues')}</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
              <HealthMetric label={t('vaultHealth.metric.notes')} value={summary.noteCount} />
              <HealthMetric label={t('vaultHealth.metric.links')} value={summary.linkCount} />
              <HealthMetric label={t('vaultHealth.metric.unresolvedLinks')} value={summary.unresolvedLinkCount} tone={summary.unresolvedLinkCount > 0 ? 'warn' : 'ok'} />
              <HealthMetric label={t('vaultHealth.metric.orphans')} value={summary.orphanCount} tone={summary.orphanCount > 0 ? 'warn' : 'ok'} />
              <HealthMetric label={t('vaultHealth.metric.openTasks')} value={summary.openTaskCount} />
              <HealthMetric label={t('vaultHealth.metric.duplicateTitles')} value={summary.duplicateTitleCount} tone={summary.duplicateTitleCount > 0 ? 'warn' : 'ok'} />
              <HealthMetric label={t('vaultHealth.metric.missingMemory')} value={summary.missingMemoryCount} />
              <HealthMetric label={t('vaultHealth.metric.staleNotes')} value={summary.staleNoteCount} />
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, fontWeight: 500 }}>
              {t('vaultHealth.nextSteps')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {nextSteps.map((step) => (
                <NextStepButton
                  key={step.id}
                  kicker={t(`vaultHealth.action.${step.id}.kicker`)}
                  title={t(`vaultHealth.action.${step.id}.title`, { count: step.count ?? 0 })}
                  desc={t(`vaultHealth.action.${step.id}.desc`)}
                  onClick={() => { void runNextStep(step.id) }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface StatePanelProps {
  title: string
  desc: string
  tone?: 'default' | 'error'
}

function StatePanel({ title, desc, tone = 'default' }: StatePanelProps) {
  return (
    <div
      style={{
        padding: '22px 20px',
        borderRadius: 8,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        marginBottom: 16
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: tone === 'error' ? '#f87171' : 'var(--text-primary)', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-tertiary)' }}>
        {desc}
      </div>
    </div>
  )
}

function SignalLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 9px',
        borderRadius: 6,
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-secondary)',
        background: 'var(--bg-base)',
        fontSize: 11,
        fontWeight: 500
      }}
    >
      {children}
    </span>
  )
}

interface HealthMetricProps {
  label: string
  value: number
  tone?: 'ok' | 'warn'
}

function HealthMetric({ label, value, tone = 'ok' }: HealthMetricProps) {
  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: tone === 'warn' && value > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}

interface NextStepButtonProps {
  kicker: string
  title: string
  desc: string
  onClick: () => void
  disabled?: boolean
}

function NextStepButton({ kicker, title, desc, onClick, disabled = false }: NextStepButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px 16px',
        textAlign: 'left',
        background: disabled ? 'var(--bg-base)' : 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 150ms, background 150ms'
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)'
        }}
      >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span style={{ minWidth: 52, fontSize: 11, fontWeight: 700, color: disabled ? 'var(--text-tertiary)' : 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {kicker}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ paddingLeft: 62, fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)' }}>{desc}</div>
    </button>
  )
}
