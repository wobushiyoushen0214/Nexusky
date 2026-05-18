import { app } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

type LogLevel = 'error' | 'warn' | 'info'

interface LogPayload {
  level: LogLevel
  message: string
  stack?: string
  context?: Record<string, unknown>
}

const REPORT_URL = 'https://website-ebon-xi-90.vercel.app/api/logs'

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

async function flush() {
  if (flushing || queue.length === 0) return
  flushing = true

  while (queue.length > 0) {
    const item = queue.shift()!
    try {
      await fetch(REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...item,
          app_version: app.getVersion(),
          platform: `${process.platform}-${process.arch}`,
          device_id: getDeviceId(),
        }),
      })
    } catch {
      // 网络失败时放回队列头部，下次重试
      queue.unshift(item)
      break
    }
  }

  flushing = false
}

function report(level: LogLevel, message: string, extra?: { stack?: string; context?: Record<string, unknown> }) {
  console.error(`[${level}]`, message, extra?.stack || '')

  queue.push({
    level,
    message,
    stack: extra?.stack,
    context: extra?.context,
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
