import { describe, expect, it } from 'vitest'
import { matchesShortcut, normalizeShortcutKey, type ShortcutEvent } from '../packages/renderer/src/utils/shortcuts'

describe('shortcut matching', () => {
  it('normalizes common key names used by configurable bindings', () => {
    expect(normalizeShortcutKey('s')).toBe('S')
    expect(normalizeShortcutKey(' ')).toBe('Space')
    expect(normalizeShortcutKey('Escape')).toBe('Esc')
  })

  it('matches configurable Ctrl shortcuts with platform meta-key support', () => {
    expect(matchesShortcut(event({ key: 'j', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+J')).toBe(true)
    expect(matchesShortcut(event({ key: 'j', metaKey: true, shiftKey: true }), 'Ctrl+Shift+J')).toBe(true)
    expect(matchesShortcut(event({ key: 'h', ctrlKey: true }), 'Ctrl+Shift+H')).toBe(false)
  })

  it('requires modifier parity so customized editor bindings do not shadow unrelated keys', () => {
    expect(matchesShortcut(event({ key: 's', ctrlKey: true }), 'Ctrl+S')).toBe(true)
    expect(matchesShortcut(event({ key: 's', ctrlKey: true, altKey: true }), 'Ctrl+S')).toBe(false)
    expect(matchesShortcut(event({ key: 'h', ctrlKey: true }), 'Ctrl+H')).toBe(true)
  })
})

function event(overrides: Partial<ShortcutEvent>): ShortcutEvent {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides
  }
}
