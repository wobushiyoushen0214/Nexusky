import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { encrypt, decrypt, isEncrypted } from './secret'

function getStorePath(): string {
  return join(app.getPath('userData'), 'config.json')
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
    // 自动迁移：发现明文敏感字段时透明 re-encrypt
    if (this.hasPlainSecrets(raw)) {
      this.data[key] = encryptSecrets(raw)
      this.scheduleSave()
    }
    return decrypted
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

