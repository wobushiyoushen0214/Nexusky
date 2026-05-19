import { describe, expect, it } from 'vitest'
import { extractJsonFromText } from '../packages/main/src/services/ai/json'

describe('extractJsonFromText', () => {
  it('parses a fenced JSON object', () => {
    expect(extractJsonFromText('```json\n{"ok":true}\n```', 'object')).toEqual({ ok: true })
  })

  it('parses JSON with explanatory text around it', () => {
    const raw = 'Here is the plan:\n[{"title":"A","brief":"B"}]\nDone.'

    expect(extractJsonFromText(raw, 'array')).toEqual([{ title: 'A', brief: 'B' }])
  })

  it('keeps braces inside strings while scanning candidates', () => {
    const raw = 'result: {"summary":"Use {x} and [y]","topics":["AI"]}'

    expect(extractJsonFromText(raw, 'object')).toEqual({ summary: 'Use {x} and [y]', topics: ['AI'] })
  })

  it('rejects the wrong expected root type', () => {
    expect(() => extractJsonFromText('{"ok":true}', 'array')).toThrow('AI 未返回有效的 JSON')
  })
})
