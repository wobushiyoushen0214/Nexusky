import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AIProviderConfig } from '../packages/main/src/services/ai/base-provider'

const storeData = new Map<string, unknown>()

vi.mock('../packages/main/src/services/store', () => ({
  store: {
    get: vi.fn((key: string) => storeData.get(key)),
    set: vi.fn((key: string, value: unknown) => { storeData.set(key, value) }),
    flush: vi.fn(),
  }
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    encryptString: vi.fn((plain: string) => Buffer.from(plain, 'utf8')),
    decryptString: vi.fn((buf: Buffer) => buf.toString('utf8')),
    isEncryptionAvailable: vi.fn(() => false),
  },
}))

describe('P0 security guards', () => {
  let root = ''
  let vault = ''
  let outside = ''

  beforeEach(() => {
    storeData.clear()
    root = mkdtempSync(join(tmpdir(), 'nexusky-p0-security-'))
    vault = join(root, 'vault')
    outside = join(root, 'outside')
    mkdirSync(vault, { recursive: true })
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(vault, 'note.md'), 'ok')
    writeFileSync(join(outside, 'secret.md'), 'hidden')
    storeData.set('vaultPath', vault)
  })

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }) } catch {}
    vi.restoreAllMocks()
  })

  it('rejects file paths outside the trusted current vault', async () => {
    const { assertPathInsideCurrentVault } = await import('../packages/main/src/ipc/vault-guard')

    await expect(assertPathInsideCurrentVault(join(outside, 'secret.md'))).rejects.toThrow()
    await expect(assertPathInsideCurrentVault(join(vault, 'note.md'))).resolves.toMatchObject({ vaultPath: vault })
  })

  it('rejects renderer-supplied vault paths that differ from the trusted current vault', async () => {
    const { requireCurrentVaultPath } = await import('../packages/main/src/ipc/vault-guard')

    await expect(requireCurrentVaultPath(outside)).rejects.toThrow(/不是当前打开/)
  })

  it('redacts provider api keys before returning config to renderer', async () => {
    const { redactProviderForRenderer, mergeProviderSecretsForStore } = await import('../packages/main/src/ipc/ai/provider')
    const stored: AIProviderConfig = {
      id: 'p1',
      name: 'OpenAI',
      type: 'openai',
      baseUrl: '',
      apiKey: 'sk-secret',
      model: 'gpt-4.1-mini',
      enabled: true
    }

    expect(redactProviderForRenderer(stored)).toMatchObject({ apiKey: '', hasApiKey: true })

    const merged = mergeProviderSecretsForStore([{ ...stored, apiKey: '', hasApiKey: true, model: 'gpt-5.4' }], [stored])
    expect(merged[0].apiKey).toBe('sk-secret')
    expect(merged[0]).not.toHaveProperty('hasApiKey')
  })

  it('keeps telemetry disabled by default and only enables after opt-in', async () => {
    const { getTelemetryPrefs, setTelemetryPrefs } = await import('../packages/main/src/services/logger')

    expect(getTelemetryPrefs()).toEqual({ enabled: false })
    expect(setTelemetryPrefs({ enabled: true })).toEqual({ enabled: true })
    expect(getTelemetryPrefs()).toEqual({ enabled: true })
    expect(setTelemetryPrefs({ enabled: false })).toEqual({ enabled: false })
  })
})
