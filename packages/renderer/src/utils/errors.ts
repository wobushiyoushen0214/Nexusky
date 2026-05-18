export function getErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return fallback
}

export function isCancellationError(error: unknown): boolean {
  const message = getErrorMessage(error) || String(error || '')
  return message.includes('已取消') || /aborted?|cancel/i.test(message)
}
