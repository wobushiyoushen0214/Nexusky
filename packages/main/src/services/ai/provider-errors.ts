const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'])
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529])
const NON_RETRYABLE_STATUS = new Set([401, 403, 404])

export const MAX_PROVIDER_RETRIES = 3

export interface ProviderErrorInfo {
  message: string
  code?: string
  status?: number
  isAbort: boolean
  retryable: boolean
}

function getErrorField(error: unknown, key: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[key]
}

export function normalizeProviderError(error: unknown): ProviderErrorInfo {
  const name = getErrorField(error, 'name')
  const rawCode = getErrorField(error, 'code')
  const rawStatus = getErrorField(error, 'status')
  const rawMessage = getErrorField(error, 'message')
  const message = typeof rawMessage === 'string' && rawMessage.trim()
    ? rawMessage
    : String(error || 'AI provider request failed')
  const code = typeof rawCode === 'string' ? rawCode : undefined
  const status = typeof rawStatus === 'number' ? rawStatus : undefined
  const isAbort = name === 'AbortError'
  const retryable =
    !isAbort &&
    (
      (code !== undefined && RETRYABLE_CODES.has(code)) ||
      (status !== undefined && RETRYABLE_STATUS.has(status)) ||
      /ECONNRESET|ETIMEDOUT/i.test(message)
    ) &&
    !(status !== undefined && NON_RETRYABLE_STATUS.has(status))

  return { message, code, status, isAbort, retryable }
}

export function getProviderRetryDelay(attempt: number): number {
  return 500 * Math.pow(3, attempt)
}
