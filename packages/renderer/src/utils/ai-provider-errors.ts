import type { TFunction } from 'i18next'

export type AiProviderErrorKind = 'api_key' | 'model' | 'network' | 'rate_limit' | 'context' | 'timeout' | 'unknown'

export function classifyAiProviderError(message: string): AiProviderErrorKind {
  const lower = message.toLowerCase()
  if (!lower.trim()) return 'unknown'
  if (/abort|timeout|timed out|etimedout|超时|中止/.test(lower)) return 'timeout'
  if (/context|token|maximum|too long|too many tokens|context_length|上下文|过长/.test(lower)) return 'context'
  if (/429|rate[ -]?limit|too many requests|quota|billing|insufficient_quota|限流|频率|配额|额度/.test(lower)) return 'rate_limit'
  if (/401|403|unauthorized|forbidden|api[ _-]?key|apikey|invalid key|auth|credential|permission denied|认证|鉴权|密钥|权限/.test(lower)) return 'api_key'
  if (/model|deployment|engine/.test(lower) && /not found|does not exist|unknown|invalid|unsupported|missing|不存在|无效|不支持/.test(lower)) return 'model'
  if (/model_not_found|invalid_model|unknown model|模型/.test(lower)) return 'model'
  if (/network|fetch|econn|enotfound|eai_again|dns|getaddrinfo|tls|certificate|socket|proxy|connection refused|连接|网络/.test(lower)) return 'network'
  return 'unknown'
}

export function sanitizeAiProviderErrorDetail(message: string): string {
  let detail = message
    .replace(/[A-Za-z]:\\[^\s]+\\(node_modules|app\.asar[^\s]*)/g, '<...>')
    .replace(/\/[^\s]+\/(node_modules|app\.asar[^\s]*)/g, '<...>')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <redacted>')
    .replace(/\b(?:sk|rk|ak|xai|key)-[A-Za-z0-9_-]{12,}\b/g, '<redacted-key>')
    .replace(/\s+/g, ' ')
    .trim()

  if (detail.length > 180) detail = `${detail.slice(0, 180)}...`
  return detail
}

export function formatAiProviderError(message: string, t: TFunction): string {
  const kind = classifyAiProviderError(message)
  const summary = String(t(`aiProviderErrors.kinds.${kind}`))
  const detail = sanitizeAiProviderErrorDetail(message)
  if (!detail) return summary
  return String(t('aiProviderErrors.withDetail', { message: summary, detail }))
}
