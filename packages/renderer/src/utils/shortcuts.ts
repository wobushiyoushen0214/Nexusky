export type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export function normalizeShortcutKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key === 'Escape') return 'Esc'
  return key.length === 1 ? key.toUpperCase() : key
}

export function matchesShortcut(e: ShortcutEvent, shortcut: string): boolean {
  if (!shortcut) return false
  const parts = shortcut.split('+').map((part) => part.trim()).filter(Boolean)
  const key = parts.find((part) => !['Ctrl', 'Shift', 'Alt'].includes(part))
  const wantsCtrl = parts.includes('Ctrl')
  const wantsShift = parts.includes('Shift')
  const wantsAlt = parts.includes('Alt')
  return (
    normalizeShortcutKey(e.key) === key &&
    (e.ctrlKey || e.metaKey) === wantsCtrl &&
    e.shiftKey === wantsShift &&
    e.altKey === wantsAlt
  )
}
