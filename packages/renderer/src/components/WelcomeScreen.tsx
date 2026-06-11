import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import type { WorkflowSampleVaultId } from '@shared/types/ipc'
import { getErrorMessage } from '../utils/errors'
import { SAMPLE_WORKFLOW_VAULTS } from '../../../shared/src/workflow-samples'
import { DemoTransformationFlow } from './demo/DemoTransformationFlow'
import './WelcomeScreen.css'

export function WelcomeScreen() {
  const { t } = useTranslation()
  const { selectVault, createVault, createSampleVault } = useVaultStore()
  const [isCreating, setIsCreating] = useState(false)
  const [creatingSample, setCreatingSample] = useState<WorkflowSampleVaultId | null>(null)
  const [vaultName, setVaultName] = useState('')
  const [recentVaults, setRecentVaults] = useState<string[]>([])
  const [showDemo, setShowDemo] = useState(false)

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
    <div className="welcome-screen">
      {showDemo && <DemoTransformationFlow onClose={() => setShowDemo(false)} />}
      <main className="welcome-shell" aria-labelledby="welcome-title">
        <section className="welcome-hero">
          <div className="welcome-brandmark" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path d="M12 3L2 7l10 4 10-4-10-4z" fill="currentColor" opacity="0.9" />
              <path d="M2 17l10 4 10-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
              <path d="M2 12l10 4 10-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
            </svg>
          </div>
          <div>
            <h1 id="welcome-title" className="welcome-title">Nexusky</h1>
            <p className="welcome-subtitle">{t('welcome.subtitle')}</p>
          </div>
          <div className="welcome-signals" aria-label={t('welcome.subtitle')}>
            <WelcomeSignal>{t('welcome.signal.local')}</WelcomeSignal>
            <WelcomeSignal>{t('welcome.signal.memory')}</WelcomeSignal>
            <WelcomeSignal>{t('welcome.signal.review')}</WelcomeSignal>
          </div>
          <div className="welcome-loop" aria-hidden="true">
            <WelcomeLoopStep index="01" label={t('vaultHealth.title')} />
            <WelcomeLoopStep index="02" label={t('activityBar.graph')} />
            <WelcomeLoopStep index="03" label={t('activityBar.maintenance')} />
          </div>
          <button type="button" onClick={() => setShowDemo(true)} className="welcome-demo-button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
            </svg>
            {t('welcome.demo.button')}
          </button>
        </section>

        <section className="welcome-start-panel" aria-label={t('welcome.action.open')}>
          <div className="welcome-panel-header">
            <div>
              <div className="welcome-panel-kicker">{t('welcome.signal.local')}</div>
              <h2>{t('welcome.action.open')}</h2>
            </div>
          </div>

          {isCreating ? (
            <div className="welcome-create-form">
              <input
                autoFocus
                value={vaultName}
                onChange={(e) => setVaultName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setIsCreating(false); setVaultName('') }
                }}
                placeholder={t('welcome.create.placeholder')}
                className="welcome-input"
              />
              <div className="welcome-action-row">
                <button type="button" onClick={handleCreate} className="welcome-button is-primary">
                  {t('welcome.create.confirm')}
                </button>
                <button type="button" onClick={() => { setIsCreating(false); setVaultName('') }} className="welcome-button">
                  {t('welcome.create.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="welcome-action-stack">
              <button type="button" onClick={selectVault} className="welcome-button is-primary">
                {t('welcome.action.open')}
              </button>
              <button type="button" onClick={() => setIsCreating(true)} className="welcome-button">
                {t('welcome.action.create')}
              </button>
            </div>
          )}

          {recentVaults.length > 0 && !isCreating && (
            <div className="welcome-recent">
              <p className="welcome-section-label">{t('welcome.recent')}</p>
              <div className="welcome-recent-list">
                {recentVaults.map((path) => {
                  const name = path.split(/[\\/]/).pop() || path
                  return (
                    <button
                      key={path}
                      type="button"
                      onClick={() => handleOpenRecent(path)}
                      className="welcome-recent-item"
                      title={path}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <section className="welcome-samples" aria-labelledby="welcome-samples-title">
          <div className="welcome-samples-head">
            <div>
              <div className="welcome-panel-kicker">{t('welcome.samples.label')}</div>
              <h2 id="welcome-samples-title">{t('welcome.samples.label')}</h2>
            </div>
            <p>{t('welcome.samples.description')}</p>
          </div>
          <div className="welcome-sample-list">
            {SAMPLE_WORKFLOW_VAULTS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => handleCreateSample(sample.id)}
                disabled={creatingSample !== null}
                className="welcome-sample-item"
              >
                <span className="welcome-sample-copy">
                  <strong>{t(`welcome.samples.${sample.id}.title`)}</strong>
                  <span>{t(`welcome.samples.${sample.id}.description`)}</span>
                </span>
                <span className="welcome-sample-action">
                  {creatingSample === sample.id ? t('welcome.samples.creating') : t('welcome.samples.open')}
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function WelcomeLoopStep({ index, label }: { index: string; label: string }) {
  return (
    <div className="welcome-loop-step">
      <span>{index}</span>
      <strong>{label}</strong>
    </div>
  )
}

function WelcomeSignal({ children }: { children: ReactNode }) {
  return (
    <span className="welcome-signal">
      {children}
    </span>
  )
}
