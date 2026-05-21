import { describe, expect, it } from 'vitest'
import { isBatchPlanContent, parseBatchPlanLine, stopPendingBatchPlanContent } from '../packages/renderer/src/components/ai/batch-progress'

describe('chat batch progress helpers', () => {
  it('detects compact batch plan messages', () => {
    expect(isBatchPlanContent('○ React / Hooks\n✓ Vue / 基础')).toBe(true)
    expect(isBatchPlanContent('○ React\n\n普通回答')).toBe(false)
    expect(isBatchPlanContent('普通回答')).toBe(false)
  })

  it('parses pending, done, and stopped plan lines', () => {
    expect(parseBatchPlanLine('○ React / Hooks')).toEqual({ state: 'pending', title: 'React / Hooks' })
    expect(parseBatchPlanLine('✓ Vue / 基础')).toEqual({ state: 'done', title: 'Vue / 基础' })
    expect(parseBatchPlanLine('× Svelte / 入门')).toEqual({ state: 'stopped', title: 'Svelte / 入门' })
  })

  it('marks only pending plan lines as stopped', () => {
    expect(stopPendingBatchPlanContent('✓ React / Hooks\n○ Vue / 基础\n× Svelte / 入门')).toBe('✓ React / Hooks\n× Vue / 基础\n× Svelte / 入门')
  })

  it('leaves non-plan messages unchanged', () => {
    expect(stopPendingBatchPlanContent('○ React\n\n这是正文')).toBe('○ React\n\n这是正文')
  })
})
