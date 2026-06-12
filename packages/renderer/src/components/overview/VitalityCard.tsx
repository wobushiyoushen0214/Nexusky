import { useTranslation } from 'react-i18next'
import type { VaultHealthSummary } from '@shared/types/ipc'
import { VitalityTrendChart, type VitalityTrendPoint } from './OverviewCharts'
import './VitalityCard.css'

interface VitalityCardProps {
  health: VaultHealthSummary | null
}

const TREND_WINDOW = 7

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function normalizeTrendData(scores: number[], fallbackScore: number): VitalityTrendPoint[] {
  const source = scores.length > 0 ? scores.map(clampScore) : [clampScore(fallbackScore)]
  const padded = source.length >= TREND_WINDOW
    ? source.slice(-TREND_WINDOW)
    : [...Array(TREND_WINDOW - source.length).fill(source[0]), ...source]

  return padded.map((score, index) => ({
    label: String(index + 1),
    score
  }))
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

  const score = clampScore(health.score)
  const scoreColor = score >= 80 ? 'good' : score >= 60 ? 'medium' : 'needs-attention'
  const rawTrendScores = health.trend.slice(-TREND_WINDOW).map((point) => point.score)
  const trendData = normalizeTrendData(rawTrendScores, score)
  const firstActualScore = clampScore(rawTrendScores[0] ?? score)
  const latestScore = clampScore(rawTrendScores[rawTrendScores.length - 1] ?? score)
  const scoreDelta = latestScore - firstActualScore
  const trendClass = scoreDelta > 0 ? 'trend-up' : scoreDelta < 0 ? 'trend-down' : 'trend-neutral'

  return (
    <div className={`vitality-card vitality-card--${scoreColor}`}>
      <div className="vitality-card__header">
        <div>
          <h3>{t('overviewPage.vitality.title')}</h3>
          <span>{t('overviewPage.vitality.last7days')}</span>
        </div>
        <div className="vitality-card__score-badge" aria-label={`${t('overviewPage.vitality.scoreLabel')} ${score}`}>
          <strong>{score}</strong>
          <span>{t('overviewPage.vitality.scoreSuffix')}</span>
        </div>
      </div>

      <div className="vitality-card__chart" aria-label={t('overviewPage.vitality.trendChart')}>
        <VitalityTrendChart
          className="vitality-card__echart"
          data={trendData}
          scoreLabel={t('overviewPage.vitality.scoreLabel')}
        />
      </div>

      <div className="vitality-card__summary">
        <div className="vitality-card__metric">
          <span>{t('overviewPage.vitality.trend')}</span>
          <strong className={trendClass}>
            {scoreDelta > 0 ? '+' : scoreDelta < 0 ? '-' : ''}
            {Math.abs(scoreDelta)}
          </strong>
        </div>
        <div className="vitality-card__metric">
          <span>{t('overviewPage.vitality.statusLabel')}</span>
          <strong>{t(`overviewPage.vitality.status.${scoreColor}`)}</strong>
        </div>
      </div>
    </div>
  )
}
