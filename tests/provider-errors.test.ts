import { describe, expect, it } from 'vitest'
import { getProviderRetryDelay, normalizeProviderError } from '../packages/main/src/services/ai/provider-errors'

describe('normalizeProviderError', () => {
  it('marks AbortError as non-retryable cancellation', () => {
    const error = new DOMException('aborted', 'AbortError')
    const normalized = normalizeProviderError(error)

    expect(normalized.isAbort).toBe(true)
    expect(normalized.retryable).toBe(false)
  })

  it('retries transient network and server failures', () => {
    expect(normalizeProviderError({ code: 'ECONNRESET', message: 'socket reset' }).retryable).toBe(true)
    expect(normalizeProviderError({ status: 503, message: 'service unavailable' }).retryable).toBe(true)
    expect(normalizeProviderError({ message: 'request ETIMEDOUT' }).retryable).toBe(true)
  })

  it('does not retry authentication or missing model errors', () => {
    expect(normalizeProviderError({ status: 401, message: 'unauthorized' }).retryable).toBe(false)
    expect(normalizeProviderError({ status: 404, message: 'model not found' }).retryable).toBe(false)
  })

  it('uses exponential retry delays shared by providers', () => {
    expect(getProviderRetryDelay(0)).toBe(500)
    expect(getProviderRetryDelay(1)).toBe(1500)
    expect(getProviderRetryDelay(2)).toBe(4500)
  })
})
