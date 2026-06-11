import { useTranslation } from 'react-i18next'
import type { VaultHealthSummary } from '@shared/types/ipc'
import './VitalityCard.css'

interface VitalityCardProps {
  health: VaultHealthSummary | null
}

function extractRelativeRank(value?: string): number | null {
  if (!value) return null
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}

export function VitalityCard({ health }: VitalityCardProps) {
  const { t } = useTranslation()

  if (!health) {
    return (
      <div className="vitality-card vitality-card--loading">
        <p>{t('overviewPage.vitality.scanning')}</p>
      </div>
    )
  }

  const score = health.score
  const relativeRank = extractRelativeRank(health.relativeRank)
  const growth = health.growth

  const scoreColor = score >= 80 ? 'good' : score >= 60 ? 'medium' : 'needs-attention'
  const repairSignalCount = health.unresolvedLinkCount + health.orphanCount + health.openTaskCount + health.duplicateTitleCount + health.missingMemoryCount + health.staleNoteCount
  const scoreDragFactors = health.scoreFactors
    .filter((factor) => factor.impact > 0 || factor.issueCount > 0)
    .sort((a, b) => b.impact - a.impact || b.issueCount - a.issueCount)
    .slice(0, 2)
  const topDriver = scoreDragFactors[0]
  const scoreArc = Math.max(0, Math.min(100, score)) * 3.6

  return (
    <div className={`vitality-card vitality-card--${scoreColor}`}>
      <div className="vitality-card__header">
        <div>
          <h3>{t('overviewPage.vitality.title')}</h3>
          <span>{t('overviewPage.scannedAt', { time: new Date(health.scannedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>
        </div>
        <span className="vitality-card__badge">{t(`overviewPage.vitality.status.${scoreColor}`)}</span>
      </div>

      <div className="vitality-card__score-row">
        <div
          className="vitality-card__score-ring"
          style={{ background: `conic-gradient(var(--vitality-score-color) ${scoreArc}deg, var(--vitality-track) 0deg)` }}
          aria-label={`${t('vaultHealth.score.label')} ${score}`}
        >
          <strong>{score}</strong>
          <span>{t('overviewPage.vitality.scoreSuffix')}</span>
        </div>
        <div className="vitality-card__summary">
          <strong>{relativeRank !== null ? t('overviewPage.vitality.rank', { percent: relativeRank }) : t('overviewPage.vitality.rankUnknown')}</strong>
          <span>{repairSignalCount > 0 ? t('overviewPage.vitality.signals', { count: repairSignalCount }) : t('overviewPage.vitality.noSignals')}</span>
        </div>
      </div>

      <div className="vitality-card__metrics" aria-label={t('overviewPage.vitality.metrics')}>
        <div>
          <span>{t('overviewPage.vitality.repairSignals')}</span>
          <strong>{repairSignalCount}</strong>
        </div>
        <div>
          <span>{t('overviewPage.vitality.mainDriver')}</span>
          <strong>{topDriver ? t(`vaultHealth.score.factor.${topDriver.id}`) : t('vaultHealth.score.noIssues')}</strong>
        </div>
      </div>

      <div className="vitality-card__drivers">
        {scoreDragFactors.length > 0 ? scoreDragFactors.map((factor) => (
          <div className="vitality-card__driver" key={factor.id}>
            <div>
              <span>{t(`vaultHealth.score.factor.${factor.id}`)}</span>
              <strong>{t('vaultHealth.score.impact', { impact: factor.impact })}</strong>
            </div>
            <div className="vitality-card__driver-meter">
              <span style={{ width: `${Math.min(100, factor.impact * 4)}%` }} />
            </div>
          </div>
        )) : (
          <div className="vitality-card__driver vitality-card__driver--empty">{t('vaultHealth.score.noIssues')}</div>
        )}
      </div>

      <div className="vitality-card__growth">
        <span>{t('overviewPage.vitality.thisWeek')}</span>
        <strong>+{growth?.newLinksThisWeek ?? 0} {t('overviewPage.vitality.newLinks')}</strong>
        <strong>-{growth?.orphansReducedThisWeek ?? 0} {t('overviewPage.vitality.orphansReduced')}</strong>
        {growth && growth.healthScoreChange !== 0 && (
          <strong className={`vitality-card__trend vitality-card__trend--${growth.healthScoreChange > 0 ? 'up' : 'down'}`}>
            {growth.healthScoreChange > 0 ? '↑' : '↓'} {Math.abs(growth.healthScoreChange)}
          </strong>
        )}
        </div>
    </div>
  )
}
