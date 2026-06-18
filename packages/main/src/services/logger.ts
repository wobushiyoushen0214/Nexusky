import { app } from 'electron'
import { createHmac, randomUUID } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { redact } from './redact'
import { store } from './store'

type LogLevel = 'error' | 'warn' | 'info'

interface LogPayload {
  level: LogLevel
  message: string
  stack?: string
  context?: Record<string, unknown>
}

const REPORT_URL = 'https://website-ebon-xi-90.vercel.app/api/logs'
const TELEMETRY_PREF_KEY = 'telemetry'

function telemetryEnabled(): boolean {
  const prefs = store.get(TELEMETRY_PREF_KEY) as { enabled?: boolean } | undefined
  return prefs?.enabled === true
}

export function getTelemetryPrefs(): { enabled: boolean } {
  return { enabled: telemetryEnabled() }
}

export function setTelemetryPrefs(next: { enabled: boolean }): { enabled: boolean } {
  const prefs = { enabled: next.enabled === true }
  store.set(TELEMETRY_PREF_KEY, prefs)
  if (!prefs.enabled) {
    queue.length = 0
  }
  return prefs
}

let deviceId: string | null = null
function getDeviceId(): string {
  if (!deviceId) {
    const idPath = join(app.getPath('userData'), '.device-id')
    try {
      deviceId = readFileSync(idPath, 'utf-8').trim()
    } catch {
      deviceId = randomUUID()
      try { writeFileSync(idPath, deviceId) } catch {}
    }
  }
  return deviceId
}

const queue: LogPayload[] = []
let flushing = false

function buildIngestionHeaders(body: string): Record<string, string> | null {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = process.env.NEXUSKY_LOG_INGESTION_TOKEN?.trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
    return headers
  }

  const hmacSecret = process.env.NEXUSKY_LOG_INGESTION_HMAC_SECRET?.trim()
  if (hmacSecret) {
    const timestamp = String(Date.now())
    const signature = createHmac('sha256', hmacSecret).update(`${timestamp}.${body}`).digest('hex')
    headers['X-Nexusky-Log-Timestamp'] = timestamp
    headers['X-Nexusky-Log-Signature'] = `sha256=${signature}`
    return headers
  }

  return null
}

async function flush() {
  if (!telemetryEnabled()) {
    queue.length = 0
    return
  }
  if (flushing || queue.length === 0) return
  flushing = true

  while (queue.length > 0) {
    const item = queue.shift()!
    const body = JSON.stringify({
      ...item,
      app_version: app.getVersion(),
      platform: `${process.platform}-${process.arch}`,
      device_id: getDeviceId(),
    })
    const headers = buildIngestionHeaders(body)
    if (!headers) {
      queue.length = 0
      break
    }

    try {
      const response = await fetch(REPORT_URL, {
        method: 'POST',
        headers,
        body,
      })
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          queue.unshift(item)
          break
        }
        // 401/403/400 是部署或凭证配置问题，继续重试只会堆积队列。
      }
    } catch {
      // 网络失败时放回队列头部，下次重试
      queue.unshift(item)
      break
    }
  }

  flushing = false
}

function report(level: LogLevel, message: string, extra?: { stack?: string; context?: Record<string, unknown> }) {
  const safeMessage = redact(message)
  const safeStack = extra?.stack ? redact(extra.stack) : undefined
  const safeContext = extra?.context ? redact(extra.context) : undefined

  console.error(`[${level}]`, safeMessage, safeStack || '')
  if (!telemetryEnabled()) return

  queue.push({
    level,
    message: safeMessage,
    stack: safeStack,
    context: safeContext,
  })

  flush()
}

export const logger = {
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>) {
    const err = error instanceof Error ? error : undefined
    report('error', message, {
      stack: err?.stack || (error ? String(error) : undefined),
      context,
    })
  },

  warn(message: string, context?: Record<string, unknown>) {
    report('warn', message, { context })
  },

  info(message: string, context?: Record<string, unknown>) {
    report('info', message, { context })
  },
}
