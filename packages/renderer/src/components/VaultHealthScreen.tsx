import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { VaultHealthSummary } from '@shared/types/ipc'
import { useVaultStore } from '../stores/vault-store'
import { useUIStore } from '../stores/ui-store'
import { queueAiCommandDraft } from './ai/ai-command-draft'
import {
  buildVaultHealthActionTarget,
  buildVaultHealthNextSteps,
  type VaultHealthNextStepId,
} from '../utils/vault-health-actions'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Empty, EmptyDescription } from './ui/empty'
import { Progress } from './ui/progress'
import './VaultHealthScreen.css'

interface VaultHealthScreenProps {
  vaultPath: string
  onDismiss: () => void
}

export function VaultHealthScreen({ vaultPath, onDismiss }: VaultHealthScreenProps) {
  const { t } = useTranslation()
  const setRightPanel = useUIStore((s) => s.setRightPanel)
  const focusGraphMaintenance = useUIStore((s) => s.focusGraphMaintenance)
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

  const repairSignalCount = summary
    ? summary.unresolvedLinkCount + summary.orphanCount + summary.duplicateTitleCount
    : 0
  const scoreDragFactors = summary
    ? summary.scoreFactors.filter((factor) => factor.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 3)
    : []
  const nextSteps = summary ? buildVaultHealthNextSteps(summary) : []

  const runNextStep = async (id: VaultHealthNextStepId) => {
    const target = buildVaultHealthActionTarget(id, t, summary)
    if (target.kind === 'chat') {
      queueAiCommandDraft(target.draft, () => setRightPanel('chat'))
    } else {
      focusGraphMaintenance(target.focus)
    }
    await dismiss()
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
            <Card asChild>
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
                  <Progress
                    className="vault-health-score-card__progress"
                    value={summary.score}
                    aria-label={t('vaultHealth.score.label')}
                  />
                  <div className="vault-health-score-card__label">{t('vaultHealth.score.label')} {t('vaultHealth.score.outOf')}</div>
                </div>
              </section>
            </Card>

            <Card asChild>
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
                  <Empty className="vault-health-driver is-empty">
                    <EmptyDescription>{t('vaultHealth.score.noIssues')}</EmptyDescription>
                  </Empty>
                )}
              </section>
            </Card>

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

            <Card asChild>
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
            </Card>
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
    <Card asChild>
      <section className={`vault-health-state is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
        <div className="vault-health-state__mark" aria-hidden="true" />
        <div className="vault-health-state__copy">
          <h2>{title}</h2>
          <p>{desc}</p>
          {children}
        </div>
      </section>
    </Card>
  )
}

function ScanStep({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="vault-health-scan-step">
      <span aria-hidden="true" />
      {label}
    </Badge>
  )
}

function SignalLabel({ children }: { children: ReactNode }) {
  return (
    <Badge variant="outline" className="vault-health-signal">
      {children}
    </Badge>
  )
}

interface HealthMetricProps {
  label: string
  value: number
  tone?: 'ok' | 'warn'
}

function HealthMetric({ label, value, tone = 'ok' }: HealthMetricProps) {
  return (
    <Card asChild>
      <div className={`vault-health-metric is-${tone}`}>
        <span>{label}</span>
        <strong>{value.toLocaleString()}</strong>
      </div>
    </Card>
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
      <Badge className="vault-health-next-step__kicker">{kicker}</Badge>
      <span className="vault-health-next-step__copy">
        <strong>{title}</strong>
        <span>{desc}</span>
      </span>
    </Button>
  )
}
