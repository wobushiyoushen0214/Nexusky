import { safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const PREFIX_V1 = 'enc:v1:'
const PREFIX_V2 = 'enc:v2:'

function getPortableKey(): Buffer {
  return createHash('sha256').update('nexusky-note-secret-2024').digest()
}

export function isAvailable(): boolean {
  return true
}

export function encrypt(plain: string): string {
  if (!plain) return plain
  try {
    const key = getPortableKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return PREFIX_V2 + Buffer.concat([iv, tag, encrypted]).toString('base64')
  } catch {
    return plain
  }
}

export function decrypt(value: string): string {
  if (typeof value !== 'string') return value

  if (value.startsWith(PREFIX_V2)) {
    try {
      const key = getPortableKey()
      const combined = Buffer.from(value.slice(PREFIX_V2.length), 'base64')
      const iv = combined.subarray(0, 12)
      const tag = combined.subarray(12, 28)
      const encrypted = combined.subarray(28)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
    } catch {
      return ''
    }
  }

  if (value.startsWith(PREFIX_V1)) {
    try {
      if (!safeStorage.isEncryptionAvailable()) return ''
      const buf = Buffer.from(value.slice(PREFIX_V1.length), 'base64')
      return safeStorage.decryptString(buf)
    } catch {
      return ''
    }
  }

  return value
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && (value.startsWith(PREFIX_V1) || value.startsWith(PREFIX_V2))
}

export function isV1Encrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX_V1)
}
