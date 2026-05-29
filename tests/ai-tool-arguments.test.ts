import { describe, expect, it } from 'vitest'
import { parseToolArguments } from '../packages/main/src/services/ai/tool-arguments'

describe('parseToolArguments', () => {
  it('parses plain tool argument objects', () => {
    expect(parseToolArguments('{"query":"agent fallback"}')).toEqual({
      args: { query: 'agent fallback' }
    })
  })

  it('parses fenced tool argument objects', () => {
    expect(parseToolArguments('```json\n{"title":"Folder/Note"}\n```')).toEqual({
      args: { title: 'Folder/Note' }
    })
  })

  it('parses tool argument objects surrounded by model text', () => {
    expect(parseToolArguments('Use this:\n{"title":"Project","extra":{"ok":true}}\nDone.')).toEqual({
      args: { title: 'Project', extra: { ok: true } }
    })
  })

  it('rejects non-object tool arguments', () => {
    expect(parseToolArguments('["query"]')).toMatchObject({
      args: {},
      error: '工具参数必须是 JSON 对象。'
    })
  })

  it('repairs tool arguments truncated at the end of a JSON object', () => {
    expect(parseToolArguments('{"query":"project roadmap"')).toEqual({
      args: { query: 'project roadmap' }
    })
  })
})
