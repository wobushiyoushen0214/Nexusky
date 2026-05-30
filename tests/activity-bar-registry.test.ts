import { describe, expect, it } from 'vitest'
import { ACTIVITY_BAR_REGISTRY, isActivityBarItemAvailable } from '../packages/renderer/src/components/sidebar/activity-bar-registry'

function item(id: string) {
  const found = ACTIVITY_BAR_REGISTRY.find((entry) => entry.id === id)
  if (!found) throw new Error(`Missing activity bar item: ${id}`)
  return found
}

describe('activity bar registry', () => {
  it('marks note panels as current-file scoped', () => {
    expect(item('outline').requiresCurrentFile).toBe(true)
    expect(item('tags').requiresCurrentFile).toBe(true)
  })

  it('only enables current-file scoped items in the editor with an open file', () => {
    expect(isActivityBarItemAvailable(item('outline'), { mainView: 'editor', currentFilePath: '/vault/a.md' })).toBe(true)
    expect(isActivityBarItemAvailable(item('outline'), { mainView: 'editor', currentFilePath: null })).toBe(false)
    expect(isActivityBarItemAvailable(item('outline'), { mainView: 'graph', currentFilePath: '/vault/a.md' })).toBe(false)
    expect(isActivityBarItemAvailable(item('tags'), { mainView: 'bases', currentFilePath: '/vault/a.md' })).toBe(false)
  })

  it('keeps global workspace items available outside the editor', () => {
    expect(isActivityBarItemAvailable(item('graph'), { mainView: 'graph', currentFilePath: null })).toBe(true)
    expect(isActivityBarItemAvailable(item('chat'), { mainView: 'bases', currentFilePath: null })).toBe(true)
    expect(isActivityBarItemAvailable(item('maintenance'), { mainView: 'graph', currentFilePath: null })).toBe(true)
  })

  it('keeps retired standalone surfaces out of the activity registry', () => {
    expect(ACTIVITY_BAR_REGISTRY.some((entry) => entry.id === 'reader')).toBe(false)
    expect(ACTIVITY_BAR_REGISTRY.some((entry) => entry.id === 'kanban')).toBe(false)
    expect(ACTIVITY_BAR_REGISTRY.some((entry) => entry.id === 'calendar')).toBe(false)
    expect(ACTIVITY_BAR_REGISTRY.some((entry) => entry.id === 'daily-note')).toBe(false)
    expect(ACTIVITY_BAR_REGISTRY.some((entry) => entry.id === 'canvas')).toBe(false)
  })

  it('keeps related context merged under knowledge maintenance instead of a separate activity item', () => {
    expect(ACTIVITY_BAR_REGISTRY.some((entry) => entry.id === 'context')).toBe(false)
    expect(item('maintenance').defaultVisible).toBe(true)
  })

  it('keeps properties and timeline command-only instead of activity items', () => {
    expect(ACTIVITY_BAR_REGISTRY.some((entry) => entry.id === 'bases')).toBe(false)
    expect(ACTIVITY_BAR_REGISTRY.some((entry) => entry.id === 'timeline')).toBe(false)
  })
})
