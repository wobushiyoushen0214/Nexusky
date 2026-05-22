/**
 * Convert an unknown thrown value to a human-readable string. Used at IPC
 * boundaries, AI provider error handlers, and cloud provider call sites to
 * keep error reporting consistent (and avoid the silent `[object Object]`
 * that comes from `String(err)` when err has no message).
 */
export function getErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof Error) return error.message || fallback || error.name
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  if (error == null) return fallback
  try {
    return String(error)
  } catch {
    return fallback
  }
}
