// Lightweight runtime guards for IPC payloads. The TypeScript signatures
// on each handler describe the expected shape, but the renderer-supplied
// values are still untrusted at runtime — these helpers enforce minimum
// invariants (presence, basic shape, length caps) before payloads reach
// service code that assumes well-formed input.

export const MAX_TITLE_LENGTH = 1024
export const MAX_DESCRIPTION_LENGTH = 200_000
export const MAX_FILE_NAME_LENGTH = 255
export const MAX_PATH_LENGTH = 4096

const FILE_NAME_DISALLOWED_RE = /[\\/]/
const FILE_NAME_TRAVERSAL_RE = /(^|[\\/])\.\.($|[\\/])/

export function ensureNonEmptyString(value: unknown, field: string, max = MAX_PATH_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid IPC payload: ${field} must be a non-empty string`)
  }
  if (value.length > max) {
    throw new Error(`Invalid IPC payload: ${field} exceeds maximum length ${max}`)
  }
  return value
}

export function ensureBoundedString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid IPC payload: ${field} must be a string`)
  }
  if (value.length > max) {
    throw new Error(`Invalid IPC payload: ${field} exceeds maximum length ${max}`)
  }
  return value
}

export function ensureOptionalBoundedString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined
  return ensureBoundedString(value, field, max)
}

export function ensureSafeFileName(value: unknown, field: string): string {
  const s = ensureNonEmptyString(value, field, MAX_FILE_NAME_LENGTH)
  if (s.includes('\0')) {
    throw new Error(`Invalid IPC payload: ${field} contains a NUL byte`)
  }
  if (FILE_NAME_DISALLOWED_RE.test(s) || FILE_NAME_TRAVERSAL_RE.test(s)) {
    throw new Error(`Invalid IPC payload: ${field} contains illegal characters`)
  }
  if (s === '.' || s === '..') {
    throw new Error(`Invalid IPC payload: ${field} is not a valid name`)
  }
  return s
}

export function ensureFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid IPC payload: ${field} must be a finite number`)
  }
  return value
}
