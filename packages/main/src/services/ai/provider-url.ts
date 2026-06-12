export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com'

export const CLAUDE_DEFAULT_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5-20251001'
]

const KNOWN_ANTHROPIC_COMPAT_SUFFIXES = [
  '/api/claudecode',
  '/api/anthropic',
  '/apps/anthropic',
  '/api/coding',
  '/claudecode',
  '/anthropic',
  '/step_plan',
  '/coding',
  '/claude'
]

export function normalizeProviderBaseUrl(baseUrl?: string): string {
  return (baseUrl || '').trim().replace(/\/+$/, '')
}

export function normalizeClaudeBaseUrlForSdk(baseUrl?: string): string | undefined {
  let normalized = normalizeProviderBaseUrl(baseUrl)
  if (!normalized) return undefined

  const lower = normalized.toLowerCase()
  if (lower.endsWith('/v1/messages')) {
    normalized = normalized.slice(0, -'/v1/messages'.length)
  } else if (lower.endsWith('/messages')) {
    normalized = normalized.slice(0, -'/messages'.length)
  }

  if (normalized.toLowerCase().endsWith('/v1')) {
    normalized = normalized.slice(0, -'/v1'.length)
  }

  return normalized || undefined
}

export function isOfficialClaudeBaseUrl(baseUrl?: string): boolean {
  const normalized = normalizeClaudeBaseUrlForSdk(baseUrl) || ANTHROPIC_DEFAULT_BASE_URL
  return normalized === ANTHROPIC_DEFAULT_BASE_URL
}

export function shouldUseClaudeBearerAuth(baseUrl?: string, authMode?: 'api-key' | 'auth-token'): boolean {
  if (authMode === 'auth-token') return true
  if (authMode === 'api-key') return false
  const normalized = normalizeClaudeBaseUrlForSdk(baseUrl)
  return Boolean(normalized && normalized !== ANTHROPIC_DEFAULT_BASE_URL)
}

function endsWithVersionSegment(url: string): boolean {
  const segment = url.split('/').pop() || ''
  return /^v\d+$/.test(segment)
}

function stripAnthropicCompatSuffix(baseUrl: string): string | null {
  const lower = baseUrl.toLowerCase()
  for (const suffix of KNOWN_ANTHROPIC_COMPAT_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return baseUrl.slice(0, -suffix.length)
    }
  }
  return null
}

function uniqueUrls(urls: string[]): string[] {
  const unique: string[] = []
  for (const url of urls) {
    if (!unique.includes(url)) unique.push(url)
  }
  return unique
}

export function buildModelsUrlCandidates(
  baseUrl: string,
  options: { isFullUrl?: boolean; modelsUrlOverride?: string } = {}
): string[] {
  const override = options.modelsUrlOverride?.trim()
  if (override) return [override]

  const trimmed = normalizeProviderBaseUrl(baseUrl)
  if (!trimmed) return []

  const candidates: string[] = []

  if (options.isFullUrl) {
    const v1Index = trimmed.indexOf('/v1/')
    if (v1Index >= 0) {
      candidates.push(`${trimmed.slice(0, v1Index)}/v1/models`)
    } else {
      const slashIndex = trimmed.lastIndexOf('/')
      const root = slashIndex >= 0 ? trimmed.slice(0, slashIndex) : ''
      if (root.includes('://') && root.length > root.indexOf('://') + 3) {
        candidates.push(`${root}/v1/models`)
      }
    }
    return uniqueUrls(candidates)
  }

  if (endsWithVersionSegment(trimmed)) {
    candidates.push(`${trimmed}/models`)
    if (!trimmed.toLowerCase().endsWith('/v1')) {
      candidates.push(`${trimmed}/v1/models`)
    }
  } else {
    candidates.push(`${trimmed}/v1/models`)
  }

  const stripped = stripAnthropicCompatSuffix(trimmed)
  const root = stripped?.replace(/\/+$/, '')
  if (root && root.includes('://')) {
    candidates.push(`${root}/v1/models`)
    candidates.push(`${root}/models`)
  }

  return uniqueUrls(candidates)
}
