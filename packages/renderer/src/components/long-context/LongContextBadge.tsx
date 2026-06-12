import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { LongContextRelationType } from '@shared/types/ipc'
import { Badge } from '../ui/badge'

export function getRelationTypeLabel(type: LongContextRelationType, t: TFunction): string {
  return t(`longContext.relationType.${type}`, { defaultValue: type })
}

export function LongContextBadge({ type, confidence }: { type: LongContextRelationType; confidence: number }) {
  const { t } = useTranslation()
  return (
    <Badge className="long-context-badge">
      <span>{getRelationTypeLabel(type, t)}</span>
      <span className="long-context-badge__confidence">{Math.round(confidence * 100)}%</span>
    </Badge>
  )
}
