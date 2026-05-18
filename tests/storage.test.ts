import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeGet, safeGetJSON, safeRemove, safeSet, safeSetJSON } from '../packages/renderer/src/utils/storage'

function installLocalStorageMock(overrides: Partial<Storage> = {}) {
  const store = new Map<string, string>()
  const mock: Storage = {
    get length() {
      return store.size
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
    ...overrides
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    configurable: true
  })
  return mock
}

describe('safe storage helpers', () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads and writes string values without leaking localStorage errors to callers', () => {
    expect(safeSet('mode', '1')).toBe(true)
    expect(safeGet('mode')).toBe('1')

    expect(safeRemove('mode')).toBe(true)
    expect(safeGet('mode')).toBeNull()
  })

  it('falls back when stored JSON is missing or invalid', () => {
    expect(safeGetJSON('missing', ['fallback'])).toEqual(['fallback'])

    safeSet('prefs', '{bad json')
    expect(safeGetJSON('prefs', { theme: 'system' })).toEqual({ theme: 'system' })
  })

  it('serializes JSON values and returns false when storage writes fail', () => {
    expect(safeSetJSON('prefs', { theme: 'dark' })).toBe(true)
    expect(safeGetJSON('prefs', { theme: 'system' })).toEqual({ theme: 'dark' })

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    installLocalStorageMock({
      getItem: vi.fn(() => { throw new Error('blocked') }),
      removeItem: vi.fn(() => { throw new Error('blocked') }),
      setItem: vi.fn(() => { throw new DOMException('quota', 'QuotaExceededError') })
    })

    expect(safeGet('prefs')).toBeNull()
    expect(safeGetJSON('prefs', { theme: 'system' })).toEqual({ theme: 'system' })
    expect(safeSet('prefs', 'x')).toBe(false)
    expect(safeSetJSON('prefs', { theme: 'dark' })).toBe(false)
    expect(safeRemove('prefs')).toBe(false)
  })
})
