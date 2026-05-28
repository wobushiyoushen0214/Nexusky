import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VaultHealthSummary } from '@shared/types/ipc'
import { useVaultStore } from '../stores/vault-store'
import { useUIStore } from '../stores/ui-store'

interface VaultHealthScreenProps {
  vaultPath: string
  onDismiss: () => void
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
    setRightPanel('chat')
    await dismiss()
  }

  const openMaintenance = async () => {
    setRightPanel('maintenance')
    await dismiss()
  }

  const openGraph = async () => {
    setMainView('graph')
    await dismiss()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)', padding: '64px 32px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
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
          <div style={{ padding: 12, borderRadius: 6, background: 'var(--bg-elevated)', color: '#f87171', fontSize: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!summary && !error && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
            {t('vaultHealth.scanning')}
          </div>
        )}

        {summary && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
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
              <NextStepButton
                title={t('vaultHealth.action.askAi.title')}
                desc={t('vaultHealth.action.askAi.desc')}
                onClick={askAi}
              />
              <NextStepButton
                title={t('vaultHealth.action.fixLinks.title', { count: summary.unresolvedLinkCount })}
                desc={t('vaultHealth.action.fixLinks.desc')}
                onClick={openMaintenance}
                disabled={summary.unresolvedLinkCount === 0}
              />
              <NextStepButton
                title={t('vaultHealth.action.browseGraph.title')}
                desc={t('vaultHealth.action.browseGraph.desc')}
                onClick={openGraph}
              />
            </div>
          </>
        )}
      </div>
    </div>
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
  title: string
  desc: string
  onClick: () => void
  disabled?: boolean
}

function NextStepButton({ title, desc, onClick, disabled = false }: NextStepButtonProps) {
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
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{desc}</div>
    </button>
  )
}
