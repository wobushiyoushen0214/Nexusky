import { describe, expect, it } from 'vitest'
import i18n from '../packages/renderer/src/i18n'
import { classifyAiProviderError, formatAiProviderError, sanitizeAiProviderErrorDetail } from '../packages/renderer/src/utils/ai-provider-errors'

describe('AI provider error attribution', () => {
  it('classifies provider failures into actionable buckets', () => {
    expect(classifyAiProviderError('401 invalid API key')).toBe('api_key')
    expect(classifyAiProviderError('deployment model does not exist')).toBe('model')
    expect(classifyAiProviderError('fetch failed: ECONNREFUSED')).toBe('network')
    expect(classifyAiProviderError('429 too many requests')).toBe('rate_limit')
    expect(classifyAiProviderError('maximum context length exceeded')).toBe('context')
    expect(classifyAiProviderError('Request timed out')).toBe('timeout')
    expect(classifyAiProviderError('unexpected provider failure')).toBe('unknown')
  })

  it('formats localized next-step copy with sanitized provider detail', async () => {
    await i18n.changeLanguage('en')

    const message = formatAiProviderError('401 invalid API key sk-test123456789012345', i18n.t.bind(i18n))

    expect(message).toContain('API key or permission problem')
    expect(message).toContain('Provider detail:')
    expect(message).toContain('<redacted-key>')
    expect(message).not.toContain('sk-test123456789012345')
  })

  it('trims long provider details before displaying them', () => {
    const detail = sanitizeAiProviderErrorDetail(`provider said ${'x'.repeat(240)}`)

    expect(detail.length).toBeLessThanOrEqual(183)
    expect(detail.endsWith('...')).toBe(true)
  })
})
