import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { VaultHealthSummary } from '@shared/types/ipc'
import { useVaultStore } from '../stores/vault-store'
import { useUIStore } from '../stores/ui-store'
import { queueAiCommandDraft, type AICommandDraft } from './ai/ai-command-draft'
import { Button } from './ui/button'
import './VaultHealthScreen.css'

type VaultHealthNextStepId =
  | 'askAi'
  | 'fixLinks'
  | 'reviewStructure'
  | 'reviewTasks'
  | 'reviewMemory'
  | 'reviewStale'
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
    { id: 'browseGraph', priority: 0 }
  ]
  return [...sortedSignals, ...fallbackSteps.filter((step) => !sortedSignals.some((signal) => signal.id === step.id))]
    .slice(0, 3)
}

export function VaultHealthScreen({ vaultPath, onDismiss }: VaultHealthScreenProps) {
  const { t } = useTranslation()
  const setRightPanel = useUIStore((s) => s.setRightPanel)
  const setMainView = useUIStore((s) => s.setMainView)
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
  }

  return (
    <div className="vault-health-screen">
      <div className="vault-health-shell">
        <header className="vault-health-header">
          <div>
            <div className="vault-health-kicker">{t('vaultHealth.scanning')}</div>
            <h1>{t('vaultHealth.title')}</h1>
            <p>{t('vaultHealth.subtitle')}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={dismiss} className="vault-health-skip">
            {t('vaultHealth.skip')}
          </Button>
        </header>

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
          >
            <div className="vault-health-scan-steps">
              <ScanStep label={t('welcome.signal.local')} />
              <ScanStep label={t('activityBar.graph')} />
              <ScanStep label={t('activityBar.maintenance')} />
            </div>
          </StatePanel>
        )}

        {summary && (
          <>
            <section className="vault-health-hero">
              <div className="vault-health-hero__copy">
                <div className="vault-health-kicker">{t('vaultHealth.hero.kicker')}</div>
                <h2>
                  {repairSignalCount > 0
                    ? t('vaultHealth.hero.titleWithWork', { count: repairSignalCount })
                    : t('vaultHealth.hero.title')}
                </h2>
                <p>{t('vaultHealth.hero.body')}</p>
                <div className="vault-health-signals">
                  <SignalLabel>{t('vaultHealth.hero.signal.local')}</SignalLabel>
                  <SignalLabel>{t('vaultHealth.hero.signal.review')}</SignalLabel>
                  <SignalLabel>{t('vaultHealth.hero.signal.context')}</SignalLabel>
                </div>
              </div>
              <div className="vault-health-score-card" aria-label={t('vaultHealth.score.label')}>
                <div className="vault-health-score-card__value">{summary.score}</div>
                <div className="vault-health-score-card__label">{t('vaultHealth.score.label')} {t('vaultHealth.score.outOf')}</div>
              </div>
            </section>

            <section className="vault-health-drivers" aria-label={t('vaultHealth.score.why')}>
              <div className="vault-health-section-heading">{t('vaultHealth.score.why')}</div>
              {scoreDragFactors.length > 0 ? (
                <div className="vault-health-driver-list">
                  {scoreDragFactors.map((factor) => (
                    <div key={factor.id} className="vault-health-driver">
                      <span>{t(`vaultHealth.score.factor.${factor.id}`)}</span>
                      <strong className={`is-${factor.status}`}>{t('vaultHealth.score.impact', { impact: factor.impact })}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="vault-health-driver is-empty">{t('vaultHealth.score.noIssues')}</div>
              )}
            </section>

            <section className="vault-health-metrics" aria-label={t('vaultHealth.title')}>
              <HealthMetric label={t('vaultHealth.metric.notes')} value={summary.noteCount} />
              <HealthMetric label={t('vaultHealth.metric.links')} value={summary.linkCount} />
              <HealthMetric label={t('vaultHealth.metric.unresolvedLinks')} value={summary.unresolvedLinkCount} tone={summary.unresolvedLinkCount > 0 ? 'warn' : 'ok'} />
              <HealthMetric label={t('vaultHealth.metric.orphans')} value={summary.orphanCount} tone={summary.orphanCount > 0 ? 'warn' : 'ok'} />
              <HealthMetric label={t('vaultHealth.metric.openTasks')} value={summary.openTaskCount} />
              <HealthMetric label={t('vaultHealth.metric.duplicateTitles')} value={summary.duplicateTitleCount} tone={summary.duplicateTitleCount > 0 ? 'warn' : 'ok'} />
              <HealthMetric label={t('vaultHealth.metric.missingMemory')} value={summary.missingMemoryCount} />
              <HealthMetric label={t('vaultHealth.metric.staleNotes')} value={summary.staleNoteCount} />
            </section>

            <section className="vault-health-next" aria-labelledby="vault-health-next-title">
              <div className="vault-health-next__head">
                <h2 id="vault-health-next-title">{t('vaultHealth.nextSteps')}</h2>
              </div>
              <div className="vault-health-next__list">
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
            </section>
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
  children?: ReactNode
}

function StatePanel({ title, desc, tone = 'default', children }: StatePanelProps) {
  return (
    <section className={`vault-health-state is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="vault-health-state__mark" aria-hidden="true" />
      <div className="vault-health-state__copy">
        <h2>{title}</h2>
        <p>{desc}</p>
        {children}
      </div>
    </section>
  )
}

function ScanStep({ label }: { label: string }) {
  return (
    <span className="vault-health-scan-step">
      <span aria-hidden="true" />
      {label}
    </span>
  )
}

function SignalLabel({ children }: { children: ReactNode }) {
  return (
    <span className="vault-health-signal">
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
    <div className={`vault-health-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
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
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className="vault-health-next-step"
    >
      <span className="vault-health-next-step__kicker">{kicker}</span>
      <span className="vault-health-next-step__copy">
        <strong>{title}</strong>
        <span>{desc}</span>
      </span>
    </Button>
  )
}
