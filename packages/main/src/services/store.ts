import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

function getStorePath(): string {
  return join(app.getPath('userData'), 'config.json')
}

class Store {
  private data: Record<string, unknown> = {}
  private initialized = false

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
        this.data = JSON.parse(readFileSync(p, 'utf-8'))
      }
    } catch {
      this.data = {}
    }
  }

  get(key: string): unknown {
    this.ensureLoaded()
    return this.data[key]
  }

  set(key: string, value: unknown): void {
    this.ensureLoaded()
    this.data[key] = value
    this.save()
  }

  private save(): void {
    const p = getStorePath()
    const dir = dirname(p)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(p, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}

export const store = new Store()
