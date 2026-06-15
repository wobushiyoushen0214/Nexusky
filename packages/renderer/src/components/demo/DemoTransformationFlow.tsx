import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../stores/toast-store'
import { getErrorMessage } from '../../utils/errors'
import type { SampleVault, TransformationResult, VaultStats } from '@shared/types/ipc'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Progress } from '../ui/progress'
import { Spinner } from '../ui/spinner'
import './DemoTransformationFlow.css'

type DemoStep = 'select' | 'scan' | 'fix' | 'compare'

export function DemoTransformationFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState<DemoStep>('select')
  const [samples, setSamples] = useState<SampleVault[]>([])
  const [selectedVault, setSelectedVault] = useState<SampleVault | null>(null)
  const [selectedVaultPath, setSelectedVaultPath] = useState<string>('')
  const [beforeStats, setBeforeStats] = useState<VaultStats | null>(null)
  const [result, setResult] = useState<TransformationResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.invoke('demo:get-sample-vaults', undefined).then(setSamples)
  }, [])

  const handleSelectVault = async (vault: SampleVault) => {
    setSelectedVault(vault)
    // 使用预定义的测试路径
    const testPath = `/tmp/nexusky-demo-${vault.id}`
    setSelectedVaultPath(testPath)
    setStep('scan')
    setTimeout(() => handleScan(testPath), 500)
  }

  const handleScan = async (vaultPath: string) => {
    setLoading(true)
    try {
      const stats = await window.api.invoke('demo:get-stats', { vaultPath })
      setBeforeStats(stats)
      setStep('fix')
    } catch (error) {
      toast(getErrorMessage(error, t('demo.error.scan')), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleApplyFix = async () => {
    if (!selectedVault || !selectedVaultPath) return
    setLoading(true)
    try {
      const transformResult = await window.api.invoke('demo:run-transformation', {
        vaultPath: selectedVaultPath,
        vaultId: selectedVault.id
      })
      setResult(transformResult)
      setStep('compare')
    } catch (error) {
      toast(getErrorMessage(error, t('demo.error.fix')), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent
        className="demo-flow-shell"
        overlayClassName="demo-flow-overlay"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogHeader className="demo-flow-header">
          <DialogTitle>{t('demo.title')}</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className="demo-close-button" aria-label={t('common.close')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
          </DialogClose>
        </DialogHeader>

        {step === 'select' && (
          <div className="demo-step-content">
            <p className="demo-intro">{t('demo.intro')}</p>
            <div className="demo-sample-grid">
              {samples.map((sample) => (
                <Card key={sample.id} asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleSelectVault(sample)}
                    className="demo-sample-card"
                  >
                    <h3>{sample.name}</h3>
                    <p>{sample.description}</p>
                    <div className="demo-sample-stats">
                      <span>{sample.noteCount} {t('demo.notes')}</span>
                      <Badge variant="outline" className="demo-issue-count">{sample.scenario}</Badge>
                    </div>
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {step === 'scan' && (
          <div className="demo-step-content demo-scanning">
            <Spinner className="demo-spinner" aria-hidden="true" />
            <p>{t('demo.scanning', { name: selectedVault?.name })}</p>
          </div>
        )}

        {step === 'fix' && beforeStats && (
          <div className="demo-step-content">
            <h3>{t('demo.issues.found')}</h3>
            <div className="demo-issues-list">
              <IssueMetric label={t('demo.issues.brokenLinks')} value={beforeStats.unresolvedLinkCount} />
              <IssueMetric label={t('demo.issues.orphanNotes')} value={beforeStats.orphanCount} />
              <IssueMetric label={t('demo.issues.missingProperties')} value={beforeStats.missingPropertyCount} />
              <Card asChild>
                <div className="demo-health-score">
                  <span>{t('demo.healthScore')}</span>
                  <div className="demo-health-score__meter">
                    <strong className="demo-score-bad">{beforeStats.healthScore}</strong>
                    <Progress
                      className="demo-health-score__progress"
                      value={beforeStats.healthScore}
                      aria-label={t('demo.healthScore')}
                    />
                  </div>
                </div>
              </Card>
            </div>
            <Button
              type="button"
              onClick={handleApplyFix}
              disabled={loading}
              className="demo-fix-button"
            >
              {loading ? t('demo.fixing') : t('demo.applyFix')}
            </Button>
          </div>
        )}

        {step === 'compare' && result && result.afterStats && (
          <div className="demo-step-content">
            <h3>{t('demo.transformation.complete')}</h3>
            <div className="demo-comparison">
              <Card asChild>
                <div className="demo-comparison-column">
                  <span className="demo-comparison-label">{t('demo.before')}</span>
                  <div className="demo-comparison-stats">
                    <StatItem label={t('demo.issues.brokenLinks')} value={result.beforeStats.unresolvedLinkCount} />
                    <StatItem label={t('demo.issues.orphanNotes')} value={result.beforeStats.orphanCount} />
                    <StatItem label={t('demo.healthScore')} value={result.beforeStats.healthScore} valueClassName="demo-score-bad" />
                  </div>
                </div>
              </Card>
              <div className="demo-comparison-arrow">→</div>
              <Card asChild>
                <div className="demo-comparison-column">
                  <span className="demo-comparison-label">{t('demo.after')}</span>
                  <div className="demo-comparison-stats">
                    <StatItem label={t('demo.issues.brokenLinks')} value={result.afterStats.unresolvedLinkCount} valueClassName="demo-stat-improved" />
                    <StatItem label={t('demo.issues.orphanNotes')} value={result.afterStats.orphanCount} valueClassName="demo-stat-improved" />
                    <StatItem label={t('demo.healthScore')} value={result.afterStats.healthScore} valueClassName="demo-score-good" />
                  </div>
                </div>
              </Card>
            </div>
            <Card asChild>
              <div className="demo-fixes-applied">
                <p className="demo-fixes-label">{t('demo.fixesApplied')}</p>
                <ul className="demo-fixes-list">
                  {result.fixes.slice(0, 5).map((fix, idx) => (
                    <li key={idx}>{fix.type}: {fix.count} {fix.examples[0] ? `(${fix.examples[0]})` : ''}</li>
                  ))}
                </ul>
              </div>
            </Card>
            <Button type="button" onClick={onClose} className="demo-done-button">
              {t('demo.done')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function IssueMetric({ label, value }: { label: string; value: number }) {
  return (
    <Card asChild>
      <div className="demo-issue-item">
        <span>{label}</span>
        <Badge variant="outline" className="demo-issue-count">{value}</Badge>
      </div>
    </Card>
  )
}

function StatItem({ label, value, valueClassName }: { label: string; value: number; valueClassName?: string }) {
  return (
    <div className="demo-stat-item">
      <span>{label}</span>
      <strong className={valueClassName}>{value}</strong>
    </div>
  )
}
