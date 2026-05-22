import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shellMock = {
  openExternal: vi.fn(async (_url: string) => {}),
}

const loggerMock = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}

vi.mock('electron', () => ({ shell: shellMock }))
vi.mock('../packages/main/src/services/logger', () => ({ logger: loggerMock }))

async function loadModule() {
  vi.resetModules()
  return await import('../packages/main/src/services/external-url')
}

describe('safeOpenExternal', () => {
  beforeEach(() => {
    shellMock.openExternal = vi.fn(async () => {})
    loggerMock.warn = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows https URLs', async () => {
    const { safeOpenExternal } = await loadModule()
    await expect(safeOpenExternal('https://example.com/path?q=1')).resolves.toBe(true)
    expect(shellMock.openExternal).toHaveBeenCalledWith('https://example.com/path?q=1')
  })

  it('allows http URLs', async () => {
    const { safeOpenExternal } = await loadModule()
    await expect(safeOpenExternal('http://example.com')).resolves.toBe(true)
  })

  it('allows mailto URLs', async () => {
    const { safeOpenExternal } = await loadModule()
    await expect(safeOpenExternal('mailto:hello@example.com')).resolves.toBe(true)
  })

  it('blocks file:// URLs', async () => {
    const { safeOpenExternal } = await loadModule()
    await expect(safeOpenExternal('file:///etc/passwd')).resolves.toBe(false)
    expect(shellMock.openExternal).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalled()
  })

  it('blocks custom schemes like vscode://', async () => {
    const { safeOpenExternal } = await loadModule()
    await expect(safeOpenExternal('vscode://open?file=/tmp')).resolves.toBe(false)
    expect(shellMock.openExternal).not.toHaveBeenCalled()
  })

  it('blocks javascript: scheme', async () => {
    const { safeOpenExternal } = await loadModule()
    await expect(safeOpenExternal('javascript:alert(1)')).resolves.toBe(false)
    expect(shellMock.openExternal).not.toHaveBeenCalled()
  })

  it('handles non-string input', async () => {
    const { safeOpenExternal } = await loadModule()
    await expect(safeOpenExternal(undefined as unknown as string)).resolves.toBe(false)
    await expect(safeOpenExternal(123 as unknown as string)).resolves.toBe(false)
    await expect(safeOpenExternal('')).resolves.toBe(false)
  })

  it('returns false when shell.openExternal throws', async () => {
    shellMock.openExternal = vi.fn(async () => { throw new Error('os error') })
    const { safeOpenExternal } = await loadModule()
    await expect(safeOpenExternal('https://example.com')).resolves.toBe(false)
    expect(loggerMock.warn).toHaveBeenCalled()
  })
})

describe('isExternalUrlAllowed', () => {
  it('rejects malformed URLs without throwing', async () => {
    const { isExternalUrlAllowed } = await loadModule()
    expect(isExternalUrlAllowed('not a url')).toBe(false)
    expect(isExternalUrlAllowed('://broken')).toBe(false)
  })
})
