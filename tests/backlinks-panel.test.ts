import { describe, expect, it } from 'vitest'
import { DEFAULT_BACKLINKS_PANEL_COLLAPSED } from '../packages/renderer/src/components/editor/BacklinksPanel'

describe('BacklinksPanel defaults', () => {
  it('keeps the link overview collapsed when an article opens', () => {
    expect(DEFAULT_BACKLINKS_PANEL_COLLAPSED).toBe(true)
  })
})
