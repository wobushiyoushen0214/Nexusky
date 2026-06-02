import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import type { WorkflowSampleVaultId } from '@shared/types/ipc'
import { getErrorMessage } from '../utils/errors'
import { SAMPLE_WORKFLOW_VAULTS } from '../../../shared/src/workflow-samples'

export function WelcomeScreen() {
  const { t } = useTranslation()
  const { selectVault, createVault, createSampleVault } = useVaultStore()
  const [isCreating, setIsCreating] = useState(false)
  const [creatingSample, setCreatingSample] = useState<WorkflowSampleVaultId | null>(null)
  const [vaultName, setVaultName] = useState('')
  const [recentVaults, setRecentVaults] = useState<string[]>([])

  useEffect(() => {
    window.api.invoke('vault:get-recent', undefined).then(setRecentVaults)
  }, [])

  const handleCreate = async () => {
    const name = vaultName.trim()
    if (!name) return
    await createVault(name)
    setIsCreating(false)
    setVaultName('')
  }

  const handleCreateSample = async (sampleId: WorkflowSampleVaultId) => {
    setCreatingSample(sampleId)
    try {
      const result = await createSampleVault(sampleId)
      if (result?.vaultPath) {
        toast(t('welcome.samples.created', { path: result.vaultPath, files: result.files }), 'success')
      }
    } catch (error) {
      toast(getErrorMessage(error, t('welcome.samples.failed')), 'error')
    } finally {
      setCreatingSample(null)
    }
  }

  const handleOpenRecent = async (path: string) => {
    const { setVaultPath, refreshFiles, indexVault } = useVaultStore.getState()
    setVaultPath(path)
    await refreshFiles()
    await indexVault()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', gap: 22, padding: '48px 24px' }}>
      <div style={{ width: 'min(620px, 100%)', textAlign: 'center' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
            <path d="M12 3L2 7l10 4 10-4-10-4z" fill="currentColor" opacity="0.9" />
            <path d="M2 17l10 4 10-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
            <path d="M2 12l10 4 10-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.02em' }}>
          Nexusky
        </h1>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 auto', maxWidth: 360 }}>
          {t('welcome.subtitle')}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <WelcomeSignal>{t('welcome.signal.local')}</WelcomeSignal>
          <WelcomeSignal>{t('welcome.signal.memory')}</WelcomeSignal>
          <WelcomeSignal>{t('welcome.signal.review')}</WelcomeSignal>
        </div>
      </div>

      <section style={{ width: 'min(620px, 100%)', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('welcome.samples.label')}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('welcome.samples.description')}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {SAMPLE_WORKFLOW_VAULTS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => handleCreateSample(sample.id)}
              disabled={creatingSample !== null}
              style={{
                minHeight: 88,
                padding: 14,
                borderRadius: 8,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                textAlign: 'left',
                cursor: creatingSample ? 'wait' : 'pointer',
                opacity: creatingSample && creatingSample !== sample.id ? 0.6 : 1
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t(`welcome.samples.${sample.id}.title`)}</div>
                  <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-tertiary)' }}>{t(`welcome.samples.${sample.id}.description`)}</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--accent-text)', background: 'var(--accent-muted)', borderRadius: 999, padding: '3px 8px' }}>
                  {creatingSample === sample.id ? t('welcome.samples.creating') : t('welcome.samples.open')}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {isCreating ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 'min(320px, 100%)' }}>
          <input
            autoFocus
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setIsCreating(false); setVaultName('') }
            }}
            placeholder={t('welcome.create.placeholder')}
            style={{
              height: 36, padding: '0 12px', fontSize: 13, borderRadius: 8,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none', transition: 'border-color 150ms',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreate}
              style={{ flex: 1, height: 36, fontSize: 13, borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
            >
              {t('welcome.create.confirm')}
            </button>
            <button
              onClick={() => { setIsCreating(false); setVaultName('') }}
              style={{ height: 36, padding: '0 14px', fontSize: 13, borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', cursor: 'pointer' }}
            >
              {t('welcome.create.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 'min(320px, 100%)' }}>
          <button
            onClick={() => setIsCreating(true)}
            style={{ height: 38, fontSize: 13, borderRadius: 8, fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            {t('welcome.action.create')}
          </button>
          <button
            onClick={selectVault}
            style={{ height: 38, fontSize: 13, borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', cursor: 'pointer' }}
          >
            {t('welcome.action.open')}
          </button>
        </div>
      )}

      {recentVaults.length > 0 && !isCreating && (
        <div style={{ width: 'min(320px, 100%)', marginTop: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('welcome.recent')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentVaults.map((path) => {
              const name = path.split(/[\\/]/).pop() || path
              return (
                <button
                  key={path}
                  onClick={() => handleOpenRecent(path)}
                  style={{
                    width: '100%', height: 34, padding: '0 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 12, color: 'var(--text-secondary)',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 150ms, background 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-muted)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function WelcomeSignal({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 9px',
        borderRadius: 6,
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        color: 'var(--text-tertiary)',
        fontSize: 11,
        fontWeight: 500
      }}
    >
      {children}
    </span>
  )
}
