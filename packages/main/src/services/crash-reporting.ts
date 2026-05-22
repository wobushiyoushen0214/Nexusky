import { app } from 'electron'
import type { WebContents } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { logger } from './logger'
import { redact } from './redact'

export interface CrashReport {
  type: string
  message: string
  stack?: string
  timestamp: string
  appVersion: string
  platform: string
  context: Record<string, unknown>
}

type RenderGoneDetails = {
  reason: string
  exitCode: number
}

type ChildGoneDetails = {
  type: string
  reason: string
  exitCode: number
  serviceName?: string
  name?: string
}

let registered = false

function errorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack
  return error == null ? undefined : String(error)
}

export function buildCrashReport(
  type: string,
  message: string,
  error?: unknown,
  context: Record<string, unknown> = {},
  timestamp = new Date()
): CrashReport {
  return {
    type,
    message: redact(message),
    stack: redact(errorStack(error)),
    timestamp: timestamp.toISOString(),
    appVersion: typeof app?.getVersion === 'function' ? app.getVersion() : 'unknown',
    platform: `${process.platform}-${process.arch}`,
    context: redact(context)
  }
}

export function serializeCrashReport(report: CrashReport): string {
  return JSON.stringify(report)
}

async function persistCrashReport(report: CrashReport): Promise<void> {
  const dir = join(app.getPath('userData'), 'crash-reports')
  await mkdir(dir, { recursive: true })
  await appendFile(join(dir, 'crashes.jsonl'), `${serializeCrashReport(report)}\n`, 'utf-8')
}

export function reportCrash(type: string, message: string, error?: unknown, context: Record<string, unknown> = {}): void {
  const report = buildCrashReport(type, message, error, context)
  persistCrashReport(report).catch((persistError) => {
    logger.warn('Crash report persistence failed', { error: persistError instanceof Error ? persistError.message : String(persistError) })
  })
  logger.error(`Crash report: ${type}`, error instanceof Error ? error : new Error(message), report.context)
}

function safeWebContentsContext(webContents: WebContents): Record<string, unknown> {
  try {
    return {
      id: webContents.id,
      url: webContents.getURL(),
      crashed: webContents.isCrashed()
    }
  } catch {
    return {}
  }
}

export function registerCrashReporting(): void {
  if (registered) return
  registered = true

  process.on('uncaughtException', (error) => {
    reportCrash('main:uncaughtException', error.message, error)
  })

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    reportCrash('main:unhandledRejection', error.message, error)
  })

  app.on('render-process-gone', (_event, webContents, details: RenderGoneDetails) => {
    reportCrash('renderer:processGone', details.reason, undefined, {
      ...safeWebContentsContext(webContents),
      reason: details.reason,
      exitCode: details.exitCode
    })
  })

  app.on('child-process-gone', (_event, details: ChildGoneDetails) => {
    reportCrash('child:processGone', details.reason, undefined, {
      childType: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name
    })
  })
}
