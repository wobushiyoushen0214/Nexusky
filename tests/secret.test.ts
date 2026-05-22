import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SafeStorageMock = {
  available: boolean
  encryptString: (plain: string) => Buffer
  decryptString: (buf: Buffer) => string
  isEncryptionAvailable: () => boolean
}

const safeStorageMock: SafeStorageMock = {
  available: false,
  encryptString: vi.fn((plain: string) => Buffer.from('ss::' + plain, 'utf8')),
  decryptString: vi.fn((buf: Buffer) => {
    const text = buf.toString('utf8')
    if (!text.startsWith('ss::')) throw new Error('not encrypted by mock')
    return text.slice(4)
  }),
  isEncryptionAvailable: vi.fn(() => safeStorageMock.available),
}

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: (plain: string) => safeStorageMock.encryptString(plain),
    decryptString: (buf: Buffer) => safeStorageMock.decryptString(buf),
    isEncryptionAvailable: () => safeStorageMock.isEncryptionAvailable(),
  },
}))

async function loadModule() {
  vi.resetModules()
  return await import('../packages/main/src/services/secret')
}

describe('secret module', () => {
  beforeEach(() => {
    safeStorageMock.available = false
    safeStorageMock.encryptString = vi.fn((plain: string) => Buffer.from('ss::' + plain, 'utf8'))
    safeStorageMock.decryptString = vi.fn((buf: Buffer) => {
      const text = buf.toString('utf8')
      if (!text.startsWith('ss::')) throw new Error('not encrypted by mock')
      return text.slice(4)
    })
    safeStorageMock.isEncryptionAvailable = vi.fn(() => safeStorageMock.available)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips plain strings via portable v2 when safeStorage is unavailable', async () => {
    safeStorageMock.available = false
    const { encrypt, decrypt, isV2Encrypted } = await loadModule()
    const out = encrypt('sk-test-key')
    expect(isV2Encrypted(out)).toBe(true)
    expect(decrypt(out)).toBe('sk-test-key')
  })

  it('uses safeStorage v3 when available', async () => {
    safeStorageMock.available = true
    const { encrypt, decrypt, isV3Encrypted, isV2Encrypted } = await loadModule()
    const out = encrypt('sk-secret')
    expect(isV3Encrypted(out)).toBe(true)
    expect(isV2Encrypted(out)).toBe(false)
    expect(safeStorageMock.encryptString).toHaveBeenCalledWith('sk-secret')
    expect(decrypt(out)).toBe('sk-secret')
  })

  it('falls back to v2 when safeStorage.encryptString throws', async () => {
    safeStorageMock.available = true
    safeStorageMock.encryptString = vi.fn(() => {
      throw new Error('keychain offline')
    })
    const { encrypt, decrypt, isV2Encrypted } = await loadModule()
    const out = encrypt('sk-fallback')
    expect(isV2Encrypted(out)).toBe(true)
    expect(decrypt(out)).toBe('sk-fallback')
  })

  it('returns empty string when v3 decrypt fails or safeStorage gone', async () => {
    safeStorageMock.available = true
    const { encrypt, decrypt } = await loadModule()
    const out = encrypt('sk-xx')
    safeStorageMock.available = false
    expect(decrypt(out)).toBe('')
  })

  it('preferredEncryption reports current scheme', async () => {
    const { preferredEncryption } = await loadModule()
    safeStorageMock.available = false
    expect(preferredEncryption()).toBe('v2')
    safeStorageMock.available = true
    expect(preferredEncryption()).toBe('v3')
  })

  it('isEncrypted recognises v1/v2/v3', async () => {
    const { isEncrypted } = await loadModule()
    expect(isEncrypted('enc:v1:abc')).toBe(true)
    expect(isEncrypted('enc:v2:abc')).toBe(true)
    expect(isEncrypted('enc:v3:abc')).toBe(true)
    expect(isEncrypted('plain')).toBe(false)
  })
})
