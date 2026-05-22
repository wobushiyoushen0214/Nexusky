import type { LongContextRelationType } from '@shared/types/ipc'

const RELATION_LABELS: Record<LongContextRelationType, string> = {
  related_to: '相关',
  caused_by: '成因',
  evolved_from: '演化',
  blocked_by: '阻塞',
  inspired_by: '启发',
  repeated_pattern: '模式',
  supports_goal: '目标',
  conflicts_with: '冲突'
}

export function getRelationTypeLabel(type: LongContextRelationType): string {
  return RELATION_LABELS[type] || type
}

export function LongContextBadge({ type, confidence }: { type: LongContextRelationType; confidence: number }) {
  return (
    <span className="long-context-badge">
      <span>{getRelationTypeLabel(type)}</span>
      <span className="long-context-badge__confidence">{Math.round(confidence * 100)}%</span>
    </span>
  )
}
