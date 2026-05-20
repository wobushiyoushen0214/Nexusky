import { describe, expect, it } from 'vitest'
import { normalizePlugin } from '../packages/main/src/ipc/plugin.ipc'

describe('local plugin API', () => {
  it('normalizes commands, panels, and editor extension declarations', () => {
    const plugin = normalizePlugin({
      id: 'research-tools',
      name: 'Research Tools',
      version: '0.1.0',
      commands: [
        { id: 'summarize', title: 'Summarize', prompt: 'Summarize this.', mode: 'edit', description: '  Useful  ' },
        { id: 'broken', title: 'Broken' }
      ],
      panels: [
        { id: 'queue', title: 'Queue', description: 'Reading queue', content: 'Paper A' },
        { id: 'bad-panel' }
      ],
      editorExtensions: [
        { id: 'callout', title: 'Paper callout', kind: 'markdown' },
        { id: 'bad-kind', title: 'Bad', kind: 'unsafe' }
      ]
    })

    expect(plugin).toMatchObject({
      id: 'research-tools',
      name: 'Research Tools',
      version: '0.1.0',
      commands: [{ id: 'summarize', title: 'Summarize', mode: 'edit', description: 'Useful' }],
      panels: [{ id: 'queue', title: 'Queue', description: 'Reading queue', content: 'Paper A' }],
      editorExtensions: [{ id: 'callout', title: 'Paper callout', kind: 'markdown' }]
    })
  })

  it('keeps commands-only plugins compatible', () => {
    const plugin = normalizePlugin({
      id: 'legacy',
      name: 'Legacy',
      commands: [{ id: 'ask', title: 'Ask', prompt: 'Ask AI' }]
    })

    expect(plugin?.commands).toHaveLength(1)
    expect(plugin?.panels).toEqual([])
    expect(plugin?.editorExtensions).toEqual([])
  })

  it('rejects manifests without plugin identity', () => {
    expect(normalizePlugin({ commands: [] })).toBeNull()
    expect(normalizePlugin(null)).toBeNull()
  })
})
