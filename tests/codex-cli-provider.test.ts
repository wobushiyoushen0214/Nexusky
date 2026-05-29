import { describe, expect, it } from 'vitest'
import {
  CODEX_CHAT_TIMEOUT_MS,
  CODEX_MAX_OUTPUT_BYTES,
  CODEX_VALIDATE_TIMEOUT_MS,
  appendLimitedProcessOutput
} from '../packages/main/src/services/ai/codex-cli-provider'

describe('Codex CLI provider process limits', () => {
  it('caps accumulated child-process output and reports truncation', () => {
    const first = appendLimitedProcessOutput({
      current: '',
      chunk: 'abcd',
      usedBytes: 0,
      maxBytes: 6
    })
    const second = appendLimitedProcessOutput({
      current: first.value,
      chunk: 'efgh',
      usedBytes: first.usedBytes,
      maxBytes: 6
    })

    expect(first).toEqual({ value: 'abcd', usedBytes: 4, truncated: false })
    expect(second.value).toBe('abcdef')
    expect(second.usedBytes).toBe(6)
    expect(second.truncated).toBe(true)
  })

  it('keeps explicit timeout and output budgets for chat and validation', () => {
    expect(CODEX_VALIDATE_TIMEOUT_MS).toBeLessThan(CODEX_CHAT_TIMEOUT_MS)
    expect(CODEX_MAX_OUTPUT_BYTES).toBeGreaterThan(100_000)
  })
})
