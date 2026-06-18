import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildLogCorsHeaders,
  buildLogRecord,
  checkLogRateLimit,
  isLogCorsAllowed,
  resetLogRateLimitForTests,
  signLogBodyForTests,
  verifyLogIngestionRequest,
} from '../website/src/lib/log-ingestion'

const vercelConfigPath = fileURLToPath(new URL('../website/vercel.json', import.meta.url))
const schemaPath = fileURLToPath(new URL('../website/supabase-schema.sql', import.meta.url))
const routePath = fileURLToPath(new URL('../website/src/app/api/logs/route.ts', import.meta.url))

describe('website log ingestion boundary', () => {
  beforeEach(() => {
    resetLogRateLimitForTests()
  })

  it('fails closed when no ingestion credential is configured', () => {
    const result = verifyLogIngestionRequest({
      headers: new Headers({ authorization: 'Bearer anything' }),
      rawBody: '{"message":"boom"}',
      env: {},
    })

    expect(result).toEqual({ ok: false, status: 503, error: 'log ingestion is not configured' })
  })

  it('accepts bearer or explicit token headers', () => {
    const env = { LOG_INGESTION_TOKEN: 'server-token' }

    expect(verifyLogIngestionRequest({
      headers: new Headers({ authorization: 'Bearer server-token' }),
      rawBody: '{"message":"boom"}',
      env,
    })).toMatchObject({ ok: true, method: 'token' })

    expect(verifyLogIngestionRequest({
      headers: new Headers({ 'x-nexusky-log-token': 'server-token' }),
      rawBody: '{"message":"boom"}',
      env,
    })).toMatchObject({ ok: true, method: 'token' })
  })

  it('accepts fresh HMAC signatures and rejects stale timestamps', () => {
    const rawBody = '{"message":"boom"}'
    const now = 1_800_000
    const freshTimestamp = String(now)
    const env = { LOG_INGESTION_HMAC_SECRET: 'hmac-secret' }

    expect(verifyLogIngestionRequest({
      headers: new Headers({
        'x-nexusky-log-timestamp': freshTimestamp,
        'x-nexusky-log-signature': signLogBodyForTests('hmac-secret', freshTimestamp, rawBody),
      }),
      rawBody,
      env,
      now,
    })).toMatchObject({ ok: true, method: 'hmac' })

    expect(verifyLogIngestionRequest({
      headers: new Headers({
        'x-nexusky-log-timestamp': '1',
        'x-nexusky-log-signature': signLogBodyForTests('hmac-secret', '1', rawBody),
      }),
      rawBody,
      env,
      now,
    })).toMatchObject({ ok: false, status: 401 })
  })

  it('limits repeated writes by source key', () => {
    const env = { LOG_RATE_LIMIT_WINDOW_MS: '1000', LOG_RATE_LIMIT_MAX: '2' }

    expect(checkLogRateLimit({ key: '203.0.113.10', env, now: 1000 })).toEqual({ allowed: true })
    expect(checkLogRateLimit({ key: '203.0.113.10', env, now: 1100 })).toEqual({ allowed: true })
    expect(checkLogRateLimit({ key: '203.0.113.10', env, now: 1200 })).toEqual({ allowed: false, retryAfterSeconds: 1 })
    expect(checkLogRateLimit({ key: '203.0.113.10', env, now: 2100 })).toEqual({ allowed: true })
  })

  it('redacts secrets before building the database record', () => {
    const result = buildLogRecord({
      level: 'warn',
      message: 'OpenAI rejected sk-abc123def456',
      stack: 'Authorization: Bearer abcdefghijklmnop',
      context: {
        apiKey: 'sk-explicit',
        nested: {
          password: 'secret-value',
          safe: 'visible',
        },
      },
      app_version: '0.8.3',
      platform: 'darwin-arm64',
      device_id: 'device-1',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.level).toBe('warn')
    expect(result.record.message).not.toContain('sk-abc123def456')
    expect(result.record.stack).toContain('[REDACTED]')
    expect(result.record.context).toMatchObject({
      apiKey: '[REDACTED]',
      nested: {
        password: '[REDACTED]',
        safe: 'visible',
      },
    })
  })

  it('allows only configured browser origins and never emits wildcard CORS', () => {
    const env = { LOG_INGESTION_ALLOWED_ORIGINS: 'https://nexusky.app, https://admin.nexusky.app, *' }
    const allowedHeaders = new Headers({ origin: 'https://nexusky.app' })
    const blockedHeaders = new Headers({ origin: 'https://evil.example' })
    const corsHeaders = buildLogCorsHeaders(allowedHeaders, env)

    expect(isLogCorsAllowed(allowedHeaders, env)).toBe(true)
    expect(corsHeaders['Access-Control-Allow-Origin']).toBe('https://nexusky.app')
    expect(isLogCorsAllowed(blockedHeaders, env)).toBe(false)
    expect(buildLogCorsHeaders(blockedHeaders, env)['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('keeps Vercel and Supabase from bypassing the route boundary', () => {
    const vercelConfig = readFileSync(vercelConfigPath, 'utf8')
    const schema = readFileSync(schemaPath, 'utf8')
    const route = readFileSync(routePath, 'utf8')

    expect(vercelConfig).not.toContain('"Access-Control-Allow-Origin", "value": "*"')
    expect(vercelConfig).not.toContain('"key": "Access-Control-Allow-Origin"')
    expect(schema).toContain('drop policy if exists "allow_insert"')
    expect(schema).not.toContain('for insert with check (true)')
    expect(schema).toContain('allow_service_insert')
    expect(route).toContain('verifyAuth()')
  })
})
