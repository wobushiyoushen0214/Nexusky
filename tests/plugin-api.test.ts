import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPluginMarketplace, installMarketplacePlugins, normalizePlugin } from '../packages/main/src/ipc/plugin.ipc'

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

  it('installs featured marketplace plugins without overwriting existing installs', async () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-plugin-market-'))
    try {
      let market = await getPluginMarketplace(vaultPath)
      expect(market.some((plugin) => plugin.id === 'market-research-synthesizer' && !plugin.installed)).toBe(true)

      const result = await installMarketplacePlugins(vaultPath, ['market-research-synthesizer'])
      expect(result.installed).toBe(1)
      expect(result.plugins.map((plugin) => plugin.id)).toContain('market-research-synthesizer')
      expect(readFileSync(join(vaultPath, '.nexusky', 'plugins', 'market-research-synthesizer.json'), 'utf-8')).toContain('Research Synthesizer')

      market = await getPluginMarketplace(vaultPath)
      expect(market.find((plugin) => plugin.id === 'market-research-synthesizer')?.installed).toBe(true)
      await expect(installMarketplacePlugins(vaultPath, ['market-research-synthesizer'])).resolves.toMatchObject({ installed: 0 })
    } finally {
      rmSync(vaultPath, { recursive: true, force: true })
    }
  })
})
