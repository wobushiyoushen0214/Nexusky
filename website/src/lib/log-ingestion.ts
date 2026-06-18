import { createHmac, timingSafeEqual } from 'node:crypto'

type HeaderSource = Pick<Headers, 'get'> | Record<string, string | string[] | undefined>

export type LogLevel = 'error' | 'warn' | 'info'

export interface LogRecord {
  level: LogLevel
  message: string
  stack: string | null
  context: unknown | null
  app_version: string | null
  platform: string | null
  device_id: string | null
}

interface VerifyOptions {
  headers: HeaderSource
  rawBody: string
  env?: Record<string, string | undefined>
  now?: number
}

interface RateLimitOptions {
  key: string
  env?: Record<string, string | undefined>
  now?: number
}

interface RateLimitBucket {
  count: number
  resetAt: number
}

const REDACTED = '[REDACTED]'
const MAX_MESSAGE_LENGTH = 4000
const MAX_STACK_LENGTH = 12000
const MAX_FIELD_LENGTH = 256
const MAX_CONTEXT_JSON_LENGTH = 12000
const DEFAULT_HMAC_MAX_SKEW_MS = 5 * 60 * 1000
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000
const DEFAULT_RATE_LIMIT_MAX = 60
const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /\bauthorization\b/i,
  /\bauth\b/i,
  /\btoken\b/i,
  /\bsecret\b/i,
  /\bpassword\b/i,
  /\bpassphrase\b/i,
  /\bcookie\b/i,
  /service[_-]?role[_-]?key/i,
  /client[_-]?secret/i,
  /private[_-]?key/i,
  /session[_-]?id/i,
]

const rateLimitBuckets = new Map<string, RateLimitBucket>()

function getHeader(headers: HeaderSource, name: string): string | null {
  if (typeof (headers as Pick<Headers, 'get'>).get === 'function') {
    return (headers as Pick<Headers, 'get'>).get(name)
  }

  const lowerName = name.toLowerCase()
  const record = headers as Record<string, string | string[] | undefined>
  const value = record[name] ?? record[lowerName]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function envNumber(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const parsed = Number(env[key])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function secureCompare(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function bearerToken(headers: HeaderSource): string | null {
  const authorization = getHeader(headers, 'authorization')
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function expectedHmac(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

function parseAllowedOrigins(env: Record<string, string | undefined>): Set<string> {
  return new Set(
    (env.LOG_INGESTION_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0 && origin !== '*'),
  )
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

function maskLooseSecrets(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, REDACTED)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${REDACTED}`)
    .replace(/\b(Basic\s+)[A-Za-z0-9+/=]{8,}/gi, `$1${REDACTED}`)
    .replace(/(["']?(?:api[_-]?key|token|password|secret)["']?\s*[:=]\s*["']?)([^"'\s,}]{4,})/gi, `$1${REDACTED}`)
}

function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) return value
  if (typeof value === 'string') return maskLooseSecrets(value)
  if (typeof value !== 'object') return value
  if (seen.has(value)) return REDACTED
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactValue(item, seen)
  }
  return result
}

function sanitizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return truncate(maskLooseSecrets(trimmed), maxLength)
}

function sanitizeOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return truncate(maskLooseSecrets(trimmed), maxLength)
}

function sanitizeContext(value: unknown): unknown | null {
  if (value == null) return null
  const redacted = redactValue(value)
  const json = JSON.stringify(redacted)
  if (json.length <= MAX_CONTEXT_JSON_LENGTH) return redacted

  return {
    truncated: true,
    preview: truncate(json, MAX_CONTEXT_JSON_LENGTH),
  }
}

export function verifyLogIngestionRequest(options: VerifyOptions):
  | { ok: true; method: 'token' | 'hmac' }
  | { ok: false; status: number; error: string } {
  const env = options.env ?? process.env
  const token = env.LOG_INGESTION_TOKEN?.trim()
  const hmacSecret = env.LOG_INGESTION_HMAC_SECRET?.trim()

  if (!token && !hmacSecret) {
    return { ok: false, status: 503, error: 'log ingestion is not configured' }
  }

  if (token) {
    const submittedToken = getHeader(options.headers, 'x-nexusky-log-token')?.trim() || bearerToken(options.headers)
    if (submittedToken && secureCompare(submittedToken, token)) {
      return { ok: true, method: 'token' }
    }
  }

  if (hmacSecret) {
    const timestamp = getHeader(options.headers, 'x-nexusky-log-timestamp')?.trim()
    const signature = getHeader(options.headers, 'x-nexusky-log-signature')?.trim()
    const timestampMs = Number(timestamp)
    const maxSkewMs = envNumber(env, 'LOG_INGESTION_HMAC_MAX_SKEW_MS', DEFAULT_HMAC_MAX_SKEW_MS)

    if (timestamp && signature && Number.isFinite(timestampMs) && Math.abs((options.now ?? Date.now()) - timestampMs) <= maxSkewMs) {
      const normalizedSignature = signature.replace(/^sha256=/i, '')
      if (secureCompare(normalizedSignature, expectedHmac(hmacSecret, timestamp, options.rawBody))) {
        return { ok: true, method: 'hmac' }
      }
    }
  }

  return { ok: false, status: 401, error: 'unauthorized' }
}

export function buildLogCorsHeaders(headers: HeaderSource, env: Record<string, string | undefined> = process.env): Record<string, string> {
  const origin = getHeader(headers, 'origin')
  const allowedOrigins = parseAllowedOrigins(env)
  const responseHeaders: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Nexusky-Log-Token, X-Nexusky-Log-Timestamp, X-Nexusky-Log-Signature',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }

  if (origin && allowedOrigins.has(origin)) {
    responseHeaders['Access-Control-Allow-Origin'] = origin
  }

  return responseHeaders
}

export function isLogCorsAllowed(headers: HeaderSource, env: Record<string, string | undefined> = process.env): boolean {
  const origin = getHeader(headers, 'origin')
  if (!origin) return true
  return parseAllowedOrigins(env).has(origin)
}

export function getLogRateLimitKey(headers: HeaderSource): string {
  const forwardedFor = getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || getHeader(headers, 'x-real-ip')?.trim() || 'unknown'
}

export function checkLogRateLimit(options: RateLimitOptions): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const env = options.env ?? process.env
  const now = options.now ?? Date.now()
  const windowMs = envNumber(env, 'LOG_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS)
  const maxRequests = envNumber(env, 'LOG_RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX)
  const current = rateLimitBuckets.get(options.key)

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(options.key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (current.count >= maxRequests) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
  }

  current.count += 1
  return { allowed: true }
}

export function resetLogRateLimitForTests(): void {
  rateLimitBuckets.clear()
}

export function buildLogRecord(payload: unknown): { ok: true; record: LogRecord } | { ok: false; error: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'json object body is required' }
  }

  const input = payload as Record<string, unknown>
  const message = sanitizeString(input.message, MAX_MESSAGE_LENGTH)
  if (!message) {
    return { ok: false, error: 'message is required' }
  }

  const level = input.level === 'warn' || input.level === 'info' || input.level === 'error' ? input.level : 'error'

  return {
    ok: true,
    record: {
      level,
      message,
      stack: sanitizeOptionalString(input.stack, MAX_STACK_LENGTH),
      context: sanitizeContext(input.context),
      app_version: sanitizeOptionalString(input.app_version, MAX_FIELD_LENGTH),
      platform: sanitizeOptionalString(input.platform, MAX_FIELD_LENGTH),
      device_id: sanitizeOptionalString(input.device_id, MAX_FIELD_LENGTH),
    },
  }
}

export function signLogBodyForTests(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${expectedHmac(secret, timestamp, rawBody)}`
}
