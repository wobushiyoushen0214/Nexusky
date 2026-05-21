import type { GeneratedNoteBatchPlanItem } from '@shared/types/ipc'

export const MAX_EDITABLE_BATCH_NOTE_COUNT = 20

const INVALID_PATH_SEGMENT_CHARS = /[<>:"|?*]/g

export function sanitizeEditableBatchDir(dir: string, fallback: string): string {
  const segments = dir
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.replace(INVALID_PATH_SEGMENT_CHARS, ' ').replace(/\s+/g, ' ').trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')

  return segments.join('/') || fallback
}

export function normalizeEditableBatchCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(count)) return 5
  return Math.min(MAX_EDITABLE_BATCH_NOTE_COUNT, Math.max(1, Math.floor(count)))
}

export function normalizeEditableBatchPlan(batches: GeneratedNoteBatchPlanItem[]): GeneratedNoteBatchPlanItem[] {
  return batches.map((batch, index) => {
    const fallbackTopic = batch.topic.trim() || batch.dir.trim() || `Topic ${index + 1}`
    const dir = sanitizeEditableBatchDir(batch.dir, fallbackTopic)
    return {
      dir,
      topic: batch.topic.trim() || dir,
      count: normalizeEditableBatchCount(batch.count)
    }
  }).filter((batch) => batch.dir.length > 0)
}
