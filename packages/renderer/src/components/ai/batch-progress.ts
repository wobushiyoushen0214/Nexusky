export type BatchPlanState = 'pending' | 'done' | 'stopped'

export interface BatchPlanLine {
  state: BatchPlanState
  title: string
}

const BATCH_PLAN_LINE_RE = /^[○✓×] .+/m
const BATCH_PLAN_MARKER_RE = /^([○✓×])\s*/

export function isBatchPlanContent(content: string): boolean {
  return BATCH_PLAN_LINE_RE.test(content) && !content.includes('\n\n')
}

export function parseBatchPlanLine(line: string): BatchPlanLine {
  const marker = line.match(BATCH_PLAN_MARKER_RE)?.[1]
  return {
    state: marker === '✓' ? 'done' : marker === '×' ? 'stopped' : 'pending',
    title: line.replace(BATCH_PLAN_MARKER_RE, '')
  }
}

export function stopPendingBatchPlanContent(content: string): string {
  if (!isBatchPlanContent(content)) return content
  return content
    .split('\n')
    .map((line) => line.startsWith('○ ') ? `× ${line.slice(2)}` : line)
    .join('\n')
}
