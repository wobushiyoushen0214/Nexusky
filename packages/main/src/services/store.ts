import { app } from 'electron'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { encrypt, decrypt, isEncrypted, isV1Encrypted, isV2Encrypted, preferredEncryption } from './secret'

function getStorePath(): string {
  if (app && typeof app.getPath === 'function') {
    return join(app.getPath('userData'), 'config.json')
  }
  const override = process.env.NEXUSKY_USER_DATA_DIR
  return join(override ?? join(tmpdir(), 'nexusky-test-user-data'), 'config.json')
}

// 字段路径模式：用于判断 value 中哪些字符串字段需要加密
// 支持点号嵌套（cloudConfig.supabaseKey）和数组通配（aiProviders[].apiKey）
const SECRET_FIELD_NAMES = new Set([
  'apiKey',
  'supabaseKey',
  'serviceRoleKey',
  'accessToken',
  'refreshToken',
  'token',
  'clientSecret',
])

function transformDeep(value: unknown, op: (s: string) => string): unknown {
  if (value == null) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((item) => transformDeep(item, op))
  }
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && SECRET_FIELD_NAMES.has(k) && v.length > 0) {
      result[k] = op(v)
    } else if (typeof v === 'object' && v !== null) {
      result[k] = transformDeep(v, op)
    } else {
      result[k] = v
    }
  }
  return result
}

function encryptSecrets(value: unknown): unknown {
  return transformDeep(value, (s) => (isEncrypted(s) ? s : encrypt(s)))
}

function decryptSecrets(value: unknown): unknown {
  return transformDeep(value, (s) => (isEncrypted(s) ? decrypt(s) : s))
}

function reencryptSecrets(value: unknown): unknown {
  // Force-upgrade any encrypted secret to the currently preferred scheme.
  // Plain values are encrypted; values that fail to decrypt are kept as-is
  // to avoid replacing them with empty strings.
  return transformDeep(value, (s) => {
    if (!isEncrypted(s)) return encrypt(s)
    const plain = decrypt(s)
    if (!plain) return s
    return encrypt(plain)
  })
}

class Store {
  private data: Record<string, unknown> = {}
  private initialized = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  private ensureLoaded(): void {
    if (!this.initialized) {
      this.initialized = true
      this.load()
    }
  }

  private load(): void {
    try {
      const p = getStorePath()
      if (existsSync(p)) {
        const raw = readFileSync(p, 'utf-8')
        this.data = JSON.parse(raw)
      } else {
        const bak = p + '.bak'
        if (existsSync(bak)) {
          const raw = readFileSync(bak, 'utf-8')
          this.data = JSON.parse(raw)
        }
      }
    } catch {
      const bak = getStorePath() + '.bak'
      try {
        if (existsSync(bak)) {
          this.data = JSON.parse(readFileSync(bak, 'utf-8'))
          return
        }
      } catch {}
      this.data = {}
    }
  }

  get(key: string): unknown {
    this.ensureLoaded()
    const raw = this.data[key]
    const decrypted = decryptSecrets(raw)
    // 自动迁移：明文 → v2/v3；v1(safeStorage) → v2/v3；v2 → v3（safeStorage 可用时）
    if (this.needsMigration(raw, decrypted)) {
      this.data[key] = reencryptSecrets(raw)
      this.scheduleSave()
    }
    return decrypted
  }

  private needsMigration(raw: unknown, decrypted: unknown): boolean {
    return (
      this.hasPlainSecrets(raw) ||
      this.hasSuccessfulV1Secrets(raw, decrypted) ||
      this.hasUpgradableV2Secrets(raw, decrypted)
    )
  }

  private hasPlainSecrets(value: unknown): boolean {
    if (value == null || typeof value !== 'object') return false
    if (Array.isArray(value)) return value.some((v) => this.hasPlainSecrets(v))
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && SECRET_FIELD_NAMES.has(k) && v.length > 0 && !isEncrypted(v)) return true
      if (typeof v === 'object' && v !== null && this.hasPlainSecrets(v)) return true
    }
    return false
  }

  private hasSuccessfulV1Secrets(raw: unknown, decrypted: unknown): boolean {
    if (raw == null || typeof raw !== 'object') return false
    if (decrypted == null || typeof decrypted !== 'object') return false
    if (Array.isArray(raw)) {
      return raw.some((v, i) => this.hasSuccessfulV1Secrets(v, (decrypted as unknown[])[i]))
    }
    const rawObj = raw as Record<string, unknown>
    const decObj = decrypted as Record<string, unknown>
    for (const [k, v] of Object.entries(rawObj)) {
      if (typeof v === 'string' && SECRET_FIELD_NAMES.has(k) && isV1Encrypted(v)) {
        const dec = decObj[k]
        if (typeof dec === 'string' && dec.length > 0) return true
      }
      if (typeof v === 'object' && v !== null) {
        if (this.hasSuccessfulV1Secrets(v, decObj[k])) return true
      }
    }
    return false
  }

  private hasUpgradableV2Secrets(raw: unknown, decrypted: unknown): boolean {
    if (preferredEncryption() !== 'v3') return false
    if (raw == null || typeof raw !== 'object') return false
    if (decrypted == null || typeof decrypted !== 'object') return false
    if (Array.isArray(raw)) {
      return raw.some((v, i) => this.hasUpgradableV2Secrets(v, (decrypted as unknown[])[i]))
    }
    const rawObj = raw as Record<string, unknown>
    const decObj = decrypted as Record<string, unknown>
    for (const [k, v] of Object.entries(rawObj)) {
      if (typeof v === 'string' && SECRET_FIELD_NAMES.has(k) && isV2Encrypted(v)) {
        const dec = decObj[k]
        if (typeof dec === 'string' && dec.length > 0) return true
      }
      if (typeof v === 'object' && v !== null) {
        if (this.hasUpgradableV2Secrets(v, decObj[k])) return true
      }
    }
    return false
  }

  set(key: string, value: unknown): void {
    this.ensureLoaded()
    this.data[key] = encryptSecrets(value)
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.save(), 500)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.save()
  }

  private save(): void {
    const p = getStorePath()
    const dir = dirname(p)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const tmpPath = p + '.tmp'
    const bakPath = p + '.bak'
    writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8')
    if (existsSync(p)) {
      try { renameSync(p, bakPath) } catch {}
    }
    renameSync(tmpPath, p)
  }
}

export const store = new Store()

