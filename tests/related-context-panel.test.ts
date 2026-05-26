import { describe, expect, it } from 'vitest'
import { getRelatedContextPanelClassName } from '../packages/renderer/src/components/long-context/RelatedContextPanel'

describe('RelatedContextPanel layout', () => {
  it('uses a top placement class when the panel is shown above article content', () => {
    expect(getRelatedContextPanelClassName('top')).toBe('related-context-panel related-context-panel--top')
  })

  it('keeps the legacy inline class available for embedded placement', () => {
    expect(getRelatedContextPanelClassName()).toBe('related-context-panel')
  })
})
