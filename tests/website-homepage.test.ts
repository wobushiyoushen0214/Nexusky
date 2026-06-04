import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../website/src/app/page.tsx', import.meta.url))
const migrationPagePath = fileURLToPath(new URL('../website/src/app/migration-guide/page.tsx', import.meta.url))

describe('website homepage copy contract', () => {
  it('leads with the vault health demo, workflow packs, and commercial boundary', () => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).toContain('const currentVersion = "0.8.2"')
    expect(source).toContain('Vault Health')
    expect(source).toContain('Today, fix these 3 things first')
    expect(source).toContain('Repair unresolved links')
    expect(source).toContain('Ask with sources')
    expect(source).toContain('Workflow packs')
    expect(source).toContain('Research')
    expect(source).toContain('Writing')
    expect(source).toContain('Developer')
    expect(source).toContain('Learning')
    expect(source).toContain('Commercial boundary')
    expect(source).toContain('Free local workspace')
    expect(source).toContain('Future paid add-ons')
    expect(source).toContain('Command Palette')
    expect(source).toContain('local vault checks')
    expect(source).toContain('Local search')
    expect(source).toContain('local relevance ranking')
    expect(source).toContain('/migration-guide')
    expect(source).not.toContain('0.5.0')
    expect(source).not.toContain('Tool Surface')
    expect(source).not.toContain('high-value vault tools')
    expect(source).not.toContain('Semantic search')
    expect(source).not.toContain('semantic ranking')
  })

  it('publishes a migration guide with backup, ignore rules, and AI boundaries', () => {
    expect(existsSync(migrationPagePath)).toBe(true)

    const source = readFileSync(migrationPagePath, 'utf8')
    expect(source).toContain('Open an existing vault')
    expect(source).toContain('Import an Obsidian vault')
    expect(source).toContain('Back up or copy the original folder')
    expect(source).toContain('.nexusky/index.db')
    expect(source).toContain('.obsidian/')
    expect(source).toContain('AI calls can include')
    expect(source).toContain('outbound preview')
    expect(source).toContain('Preview first, recover locally')
  })
})
