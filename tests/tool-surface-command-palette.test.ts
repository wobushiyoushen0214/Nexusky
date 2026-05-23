import { describe, expect, it } from 'vitest'
import { toolSurfaceCategoryToCommandCategory } from '../packages/renderer/src/components/tool-surface/tool-surface-category'

describe('tool-surface command palette wiring', () => {
  it('maps tool-surface categories into command-palette categories', () => {
    expect(toolSurfaceCategoryToCommandCategory('note')).toBe('search')
    expect(toolSurfaceCategoryToCommandCategory('task')).toBe('search')
    expect(toolSurfaceCategoryToCommandCategory('graph')).toBe('graph')
    expect(toolSurfaceCategoryToCommandCategory('memory')).toBe('ai')
    expect(toolSurfaceCategoryToCommandCategory('maintenance')).toBe('ai')
  })

  it('falls back to search for unknown categories', () => {
    const fallback = toolSurfaceCategoryToCommandCategory('something_new' as never)
    expect(fallback).toBe('search')
  })
})
