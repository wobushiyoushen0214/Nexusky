import { describe, expect, it } from 'vitest'
import { getRelatedContextCarouselIndex, getRelatedContextPanelClassName } from '../packages/renderer/src/components/long-context/RelatedContextPanel'

describe('RelatedContextPanel layout', () => {
  it('uses a top placement class when the panel is shown above article content', () => {
    expect(getRelatedContextPanelClassName('top')).toBe('related-context-panel related-context-panel--top')
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
})
