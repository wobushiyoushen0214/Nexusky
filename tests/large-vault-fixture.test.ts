import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

interface LargeVaultFixtureModule {
  buildFixtureNote: (index: number, options?: { notes?: number; folders?: number; linksPerNote?: number }) => string
  createLargeVaultFixture: (options: { out: string; notes?: number; folders?: number; linksPerNote?: number; force?: boolean }) => Promise<{ outDir: string; notes: number; folders: number; linksPerNote: number; durationMs: number }>
  parseArgs: (argv: string[]) => Record<string, string | boolean>
}

let fixture!: LargeVaultFixtureModule

beforeAll(async () => {
  fixture = (await import('../scripts/create-large-vault-fixture.mjs')) as unknown as LargeVaultFixtureModule
})

describe('large vault fixture generator', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  async function tempVault() {
    const dir = await mkdtemp(join(tmpdir(), 'nexusky-large-fixture-'))
    tempDirs.push(dir)
    return dir
  }

  it('generates deterministic Markdown notes with links, tasks, and metadata', () => {
    const note = fixture.buildFixtureNote(37, { notes: 100, folders: 8, linksPerNote: 2 })

    expect(note).toContain('# Fixture Note 00037')
    expect(note).toContain('tags:')
    expect(note).toContain('retrieval strategy')
    expect(note).toContain('[[Fixture Note')
    expect(note).toContain('[[Missing Fixture Target 37]]')
  })

  it('creates a small fixture without touching existing directories unless forced', async () => {
    const out = await tempVault()

    await expect(fixture.createLargeVaultFixture({ out, notes: 12, folders: 3, linksPerNote: 2 })).resolves.toMatchObject({
      notes: 12,
      folders: 3,
      linksPerNote: 2
    })
    await expect(fixture.createLargeVaultFixture({ out, notes: 12 })).rejects.toThrow('not empty')
    await expect(fixture.createLargeVaultFixture({ out, notes: 4, folders: 2, force: true })).resolves.toMatchObject({
      notes: 4,
      folders: 2
    })

    const metadata = JSON.parse(await readFile(join(out, '.nexusky-fixture.json'), 'utf8')) as { notes: number }
    const firstFolderEntries = await readdir(join(out, 'Area 00'))
    const attachmentInfo = await stat(join(out, '.attachments', 'fixture-asset-001.txt'))

    expect(metadata.notes).toBe(4)
    expect(firstFolderEntries.some((entry) => entry.endsWith('.md'))).toBe(true)
    expect(attachmentInfo.isFile()).toBe(true)
  })

  it('parses fixture CLI flags', () => {
    expect(fixture.parseArgs(['--out', '/tmp/vault', '--notes', '10000', '--force'])).toEqual({
      out: '/tmp/vault',
      notes: '10000',
      force: true
    })
  })
})
