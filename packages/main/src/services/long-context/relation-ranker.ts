export interface RelationFeedbackCounts {
  useful?: number
  dismissed?: number
  snoozed?: number
  notRelated?: number
  wrongReason?: number
}

export interface RelationRankInput {
  localScore: number
  aiConfidence: number
  recurrenceCount: number
  lastSeenAt: number
  feedback?: RelationFeedbackCounts
  evidence: string[]
  now?: number
  halfLifeDays?: number
}

export function rankRelation(input: RelationRankInput): number {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const daysSinceSeen = Math.max(0, (now - input.lastSeenAt) / 86_400)
  const score =
    clamp01(input.localScore) * 0.30
    + clamp01(input.aiConfidence) * 0.30
    + recurrence(input.recurrenceCount) * 0.15
    + decay(daysSinceSeen, input.halfLifeDays) * 0.10
    + normalizeFeedbackScore(feedbackScore(input.feedback || {})) * 0.10
    + evidenceScore(input.evidence) * 0.05

  return Number(clamp01(score).toFixed(4))
}

export function decay(days: number, halfLifeDays = 90): number {
  const lifeDays = Math.max(1, halfLifeDays)
  return Math.exp(-Math.max(0, days) / lifeDays)
}

export function recurrence(count: number): number {
  return Math.min(1, Math.log1p(Math.max(0, count)) / Math.log1p(8))
}

export function feedbackScore(feedback: RelationFeedbackCounts): number {
  return clamp(-1, 1,
    (feedback.useful || 0) * 0.25
    + (feedback.dismissed || 0) * -0.15
    + (feedback.snoozed || 0) * -0.1
    + (feedback.notRelated || 0) * -0.5
    + (feedback.wrongReason || 0) * -0.25
  )
}

export function evidenceScore(evidence: string[]): number {
  const meaningfulEvidence = evidence
    .map((item) => item.trim())
    .filter((item) => item.length >= 8)
  return Math.min(1, meaningfulEvidence.length / 4)
}

function normalizeFeedbackScore(score: number): number {
  return (clamp(-1, 1, score) + 1) / 2
}

function clamp01(value: number): number {
  return clamp(0, 1, value)
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value))
}
