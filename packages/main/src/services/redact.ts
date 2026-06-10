const SENSITIVE_KEY_PATTERNS: RegExp[] = [
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

const MAX_STRING_LENGTH = 1024
const REDACTED = '[REDACTED]'

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key))
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value
  return value.slice(0, MAX_STRING_LENGTH) + `…[truncated ${value.length - MAX_STRING_LENGTH} chars]`
}

function maskLooseSecrets(value: string): string {
  // Mask sk-* / Bearer * / Basic * style tokens that may show up in free-form
  // strings (error messages, URLs). We intentionally keep this conservative
  // so we don't corrupt unrelated text.
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, REDACTED)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${REDACTED}`)
    .replace(/\b(Basic\s+)[A-Za-z0-9+/=]{8,}/gi, `$1${REDACTED}`)
    .replace(/(["']?(?:api[_-]?key|token|password|secret)["']?\s*[:=]\s*["']?)([^"'\s,}]{4,})/gi, `$1${REDACTED}`)
}

export function redact<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value == null) return value
  const type = typeof value
  if (type === 'string') {
    return truncateString(maskLooseSecrets(value as unknown as string)) as unknown as T
  }
  if (type !== 'object') return value
  if (seen.has(value as unknown as object)) return value
  seen.add(value as unknown as object)

  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => redact(item, seen)) as unknown as T
  }

  if (value instanceof Error) {
    const obj: Record<string, unknown> = {
      name: value.name,
      message: redact(value.message, seen),
    }
    if (value.stack) obj.stack = redact(value.stack, seen)
    for (const key of Object.keys(value)) {
      obj[key] = isSensitiveKey(key) ? REDACTED : redact((value as unknown as Record<string, unknown>)[key], seen)
    }
    return obj as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED
    } else {
      result[key] = redact(v, seen)
    }
  }
  return result as unknown as T
}
