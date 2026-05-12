import { safeStorage } from 'electron'

const PREFIX = 'enc:v1:'

export function isAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function encrypt(plain: string): string {
  if (!plain) return plain
  if (!isAvailable()) return plain
  try {
    const buf = safeStorage.encryptString(plain)
    return PREFIX + buf.toString('base64')
  } catch {
    return plain
  }
}

export function decrypt(value: string): string {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value
  if (!isAvailable()) return ''
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    return ''
  }
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}
