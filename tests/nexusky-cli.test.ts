import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

const cli = await import('../scripts/nexusky-cli.mjs')

describe('Nexusky CLI', () => {
  async function tempVault() {
    return mkdtemp(join(tmpdir(), 'nexusky-cli-'))
  }

  it('creates Markdown notes with safe unique names', async () => {
    const vaultPath = await tempVault()

    const first = await cli.createNote({ vaultPath, title: 'Project/Plan', content: 'Next step' })
    const second = await cli.createNote({ vaultPath, title: 'Project/Plan', content: 'Another step' })

    expect(first.endsWith('Project Plan.md')).toBe(true)
    expect(second.endsWith('Project Plan 2.md')).toBe(true)
    expect(await readFile(first, 'utf8')).toBe('# Project/Plan\n\nNext step\n')
  })

  it('creates notes inside nested vault folders', async () => {
    const vaultPath = await tempVault()

    const filePath = await cli.createNote({ vaultPath, title: 'Inbox Item', dir: 'Inbox/Capture' })

    expect(filePath.endsWith('Inbox/Capture/Inbox Item.md')).toBe(true)
    expect(await readFile(filePath, 'utf8')).toBe('# Inbox Item\n')
  })

  it('rejects note creation outside the vault', async () => {
    const vaultPath = await tempVault()

    await expect(cli.createNote({ vaultPath, title: 'Escape', dir: '../outside' })).rejects.toThrow('vault')
  })

  it('searches Markdown files and skips Nexusky metadata', async () => {
    const vaultPath = await tempVault()
    await mkdir(join(vaultPath, '.nexusky'), { recursive: true })
    await writeFile(join(vaultPath, 'Alpha.md'), '# Alpha Project\n\nA durable knowledge workflow.\n', 'utf8')
    await writeFile(join(vaultPath, 'Beta.md'), '# Beta\n\nAlpha appears in the body.\n', 'utf8')
    await writeFile(join(vaultPath, '.nexusky', 'Hidden.md'), '# Alpha Hidden\n', 'utf8')

    const results = await cli.searchNotes({ vaultPath, query: 'Alpha', limit: 10 })

    expect(results.map((result: { path: string }) => result.path)).toEqual(['Alpha.md', 'Beta.md'])
    expect(results[0].line).toBe(1)
    expect(results[1].line).toBe(3)
  })

  it('parses command flags and positional values', () => {
    expect(cli.parseArgs(['search', '--vault', '/tmp/vault', '--limit', '5', 'daily', 'note'])).toEqual({
      command: 'search',
      flags: { vault: '/tmp/vault', limit: '5' },
      values: ['daily', 'note']
    })
  })
})
