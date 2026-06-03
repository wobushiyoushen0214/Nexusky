import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pagePath = fileURLToPath(new URL('../website/src/app/page.tsx', import.meta.url))

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
    expect(source).not.toContain('0.5.0')
  })
})
