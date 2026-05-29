import { safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { homedir, hostname, userInfo } from 'os'

const PREFIX_V1 = 'enc:v1:'
const PREFIX_V2 = 'enc:v2:'
const PREFIX_V3 = 'enc:v3:'

function getPortableKey(): Buffer {
  const user = (() => {
    try {
      return userInfo().username
    } catch {
      return ''
    }
  })()
  return createHash('sha256')
    .update('nexusky-note-secret-2024')
    .update('\0')
    .update(hostname())
    .update('\0')
    .update(user)
    .update('\0')
    .update(homedir())
    .digest()
}

function getLegacyPortableKey(): Buffer {
  return createHash('sha256').update('nexusky-note-secret-2024').digest()
}

function safeStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function isAvailable(): boolean {
  return true
}

function encryptPortable(plain: string): string {
  const key = getPortableKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX_V2 + Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function encryptSafeStorage(plain: string): string {
  const buf = safeStorage.encryptString(plain)
  return PREFIX_V3 + buf.toString('base64')
}

export function encrypt(plain: string): string {
  if (!plain) return plain
  if (safeStorageAvailable()) {
    try {
      return encryptSafeStorage(plain)
    } catch {
      // Fall through to portable fallback so the user never loses their secrets
      // if safeStorage briefly fails (e.g. transient Keychain issues).
    }
  }
  try {
    return encryptPortable(plain)
  } catch {
    return plain
  }
}

export function decrypt(value: string): string {
  if (typeof value !== 'string') return value

  if (value.startsWith(PREFIX_V3)) {
    try {
      if (!safeStorageAvailable()) return ''
      const buf = Buffer.from(value.slice(PREFIX_V3.length), 'base64')
      return safeStorage.decryptString(buf)
    } catch {
      return ''
    }
  }

  if (value.startsWith(PREFIX_V2)) {
    const tryDecrypt = (key: Buffer) => {
      const combined = Buffer.from(value.slice(PREFIX_V2.length), 'base64')
      const iv = combined.subarray(0, 12)
      const tag = combined.subarray(12, 28)
      const encrypted = combined.subarray(28)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
    }
    try {
      return tryDecrypt(getPortableKey())
    } catch {
      try {
        return tryDecrypt(getLegacyPortableKey())
      } catch {
        return ''
      }
    }
  }

  if (value.startsWith(PREFIX_V1)) {
    try {
      if (!safeStorageAvailable()) return ''
      const buf = Buffer.from(value.slice(PREFIX_V1.length), 'base64')
      return safeStorage.decryptString(buf)
    } catch {
      return ''
    }
  }

  return value
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && (value.startsWith(PREFIX_V1) || value.startsWith(PREFIX_V2) || value.startsWith(PREFIX_V3))
}

export function isV1Encrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX_V1)
}

export function isV2Encrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX_V2)
}

export function isV3Encrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX_V3)
}

export function preferredEncryption(): 'v3' | 'v2' {
  return safeStorageAvailable() ? 'v3' : 'v2'
}
