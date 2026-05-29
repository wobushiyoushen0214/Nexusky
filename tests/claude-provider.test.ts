import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLAUDE_MAX_TOKENS,
  MAX_CLAUDE_MAX_TOKENS,
  normalizeClaudeMaxTokens
} from '../packages/main/src/services/ai/claude-provider'
import type { ChatOptions } from '../packages/main/src/services/ai/base-provider'

describe('Claude provider options', () => {
  it('uses a configurable max token budget instead of a hard-coded 4096', () => {
    const options: ChatOptions = { maxTokens: 12_000 }

    expect(normalizeClaudeMaxTokens(options.maxTokens)).toBe(12_000)
  })

  it('bounds invalid max token values', () => {
    expect(normalizeClaudeMaxTokens()).toBe(DEFAULT_CLAUDE_MAX_TOKENS)
    expect(normalizeClaudeMaxTokens(0)).toBe(1)
    expect(normalizeClaudeMaxTokens(MAX_CLAUDE_MAX_TOKENS + 1)).toBe(MAX_CLAUDE_MAX_TOKENS)
  })
})
