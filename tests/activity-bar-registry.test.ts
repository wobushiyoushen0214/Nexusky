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
    expect(isActivityBarItemAvailable(item('tags'), { mainView: 'canvas', currentFilePath: '/vault/a.md' })).toBe(false)
  })

  it('keeps global workspace items available outside the editor', () => {
    expect(isActivityBarItemAvailable(item('graph'), { mainView: 'graph', currentFilePath: null })).toBe(true)
    expect(isActivityBarItemAvailable(item('chat'), { mainView: 'canvas', currentFilePath: null })).toBe(true)
  })
})
