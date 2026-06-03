import { describe, expect, it } from 'vitest'
import type { LongContextInspection } from '../packages/shared/src/types/ipc'
import {
  getContextPackSummary,
  getContextPackTierItems,
  getRelatedContextCarouselIndex,
  getRelatedContextPanelClassName
} from '../packages/renderer/src/components/long-context/RelatedContextPanel'

describe('RelatedContextPanel layout', () => {
  it('uses a top placement class when the panel is shown above article content', () => {
    expect(getRelatedContextPanelClassName('top')).toBe('related-context-panel related-context-panel--top')
  })

  it('uses a side placement class when the panel is shown in the right sidebar', () => {
    expect(getRelatedContextPanelClassName('side')).toBe('related-context-panel related-context-panel--side')
  })

  it('keeps the legacy inline class available for embedded placement', () => {
    expect(getRelatedContextPanelClassName()).toBe('related-context-panel')
  })

  it('cycles between related context items with left and right navigation', () => {
    expect(getRelatedContextCarouselIndex(0, 3, 1)).toBe(1)
    expect(getRelatedContextCarouselIndex(2, 3, 1)).toBe(0)
    expect(getRelatedContextCarouselIndex(0, 3, -1)).toBe(2)
    expect(getRelatedContextCarouselIndex(4, 0, 1)).toBe(0)
  })

  it('summarizes Context Pack tiers for the collapsible inspector', () => {
    const inspection = createInspection()

    expect(getContextPackSummary(inspection)).toEqual({
      hot: 1,
      warm: 1,
      cold: 0,
      dropped: 1,
      used: 420,
      budget: 1200
    })
  })

  it('returns Context Pack items for the selected tier', () => {
    const inspection = createInspection()

    expect(getContextPackTierItems(inspection, 'hot').map((item) => item.title)).toEqual(['Active note'])
    expect(getContextPackTierItems(inspection, 'cold')).toEqual([])
    expect(getContextPackTierItems(null, 'warm')).toEqual([])
  })
})

function createInspection(): LongContextInspection {
  return {
    currentFilePath: '/vault/Current.md',
    generatedAt: 1,
    pack: {
      estimatedTokens: 420,
      tokenBudget: 1200,
      hot: [{
        tier: 'hot',
        relationId: 'r1',
        title: 'Active note',
        source: 'Active.md',
        relationType: 'supports_goal',
        confidence: 0.82,
        score: 0.91,
        reason: 'Recently reinforced relation.',
        evidence: ['Current note cites active note.']
      }],
      warm: [{
        tier: 'warm',
        title: 'Recurring theme',
        confidence: 0.7,
        score: 0.7,
        reason: 'Repeated across several notes.',
        evidence: []
      }],
      cold: [],
      droppedItems: [{
        tier: 'cold',
        title: 'Old relation',
        reason: 'Would exceed token budget.',
        evidence: [],
        droppedReason: 'exceeded_token_budget'
      }]
    }
  }
}
