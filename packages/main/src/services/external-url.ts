import { shell } from 'electron'
import { logger } from './logger'

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

export function isExternalUrlAllowed(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  return ALLOWED_SCHEMES.has(parsed.protocol)
}

export async function safeOpenExternal(rawUrl: unknown): Promise<boolean> {
  if (!isExternalUrlAllowed(rawUrl)) {
    logger.warn('Blocked openExternal for disallowed URL', {
      url: typeof rawUrl === 'string' ? rawUrl.slice(0, 256) : typeof rawUrl,
    })
    return false
  }
  try {
    await shell.openExternal(rawUrl as string)
    return true
  } catch (err) {
    logger.warn('shell.openExternal failed', {
      url: (rawUrl as string).slice(0, 256),
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
