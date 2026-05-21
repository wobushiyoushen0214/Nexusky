import { describe, expect, it } from 'vitest'
import { createEditableBatchPlanItem, normalizeEditableBatchCount, normalizeEditableBatchPlan, sanitizeEditableBatchDir } from '../packages/renderer/src/components/ai/batch-plan'

describe('editable chat batch plan helpers', () => {
  it('sanitizes user-edited directories before file generation', () => {
    expect(sanitizeEditableBatchDir('../React:Core/../Hooks', 'Fallback')).toBe('React Core/Hooks')
    expect(sanitizeEditableBatchDir('..', 'Fallback')).toBe('Fallback')
  })

  it('bounds user-edited note counts', () => {
    expect(normalizeEditableBatchCount(0)).toBe(1)
    expect(normalizeEditableBatchCount(99)).toBe(20)
    expect(normalizeEditableBatchCount('6')).toBe(6)
    expect(normalizeEditableBatchCount(Number.NaN)).toBe(5)
  })

  it('creates a default editable batch plan row', () => {
    expect(createEditableBatchPlanItem(2)).toEqual({
      dir: 'Topic 3',
      topic: 'Topic 3',
      count: 5
    })
  })

  it('normalizes editable batch plans for execution', () => {
    expect(normalizeEditableBatchPlan([
      { dir: '../Vue:Core', topic: '  ', count: 3 },
      { dir: '', topic: 'Svelte', count: 99 }
    ])).toEqual([
      { dir: 'Vue Core', topic: 'Vue Core', count: 3 },
      { dir: 'Svelte', topic: 'Svelte', count: 20 }
    ])
  })
})
