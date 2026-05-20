import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'
import { formatWebClipMarkdown, safeClipFileName, saveWebClip } from '../packages/main/src/services/web-clipper'

describe('web clipper', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-web-clipper-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('creates safe clip file names', () => {
    expect(safeClipFileName('A/B: C? [Draft]')).toBe('A B C Draft')
    expect(safeClipFileName('')).toBe('Untitled Web Clip')
  })

  it('formats page metadata and selected text as Markdown', () => {
    const { markdown } = formatWebClipMarkdown({
      title: 'Article',
      url: 'https://example.com/a',
      selection: 'Selected quote'
    }, new Date('2026-05-20T01:02:03.000Z'))

    expect(markdown).toContain('title: "Article"')
    expect(markdown).toContain('source: "https://example.com/a"')
    expect(markdown).toContain('captured: "2026-05-20T01:02:03.000Z"')
    expect(markdown).toContain('Selected quote')
  })

  it('falls back to stripped html when no text is provided', () => {
    const { markdown } = formatWebClipMarkdown({
      title: 'HTML',
      html: '<style>x</style><p>Hello&nbsp;<strong>world</strong></p><script>x</script>'
    })

    expect(markdown).toContain('Hello world')
    expect(markdown).not.toContain('<script>')
  })

  it('saves unique clipping notes and indexes them', async () => {
    const first = await saveWebClip(vaultPath, { title: 'Clip', url: 'https://example.com', text: 'Body' }, new Date('2026-05-20T00:00:00.000Z'))
    const second = await saveWebClip(vaultPath, { title: 'Clip', url: 'https://example.com/2', text: 'Body 2' }, new Date('2026-05-20T00:00:00.000Z'))
    const { getAllNotes } = await import('../packages/main/src/services/indexer')

    expect(first.ok).toBe(true)
    expect(second.path).not.toBe(first.path)
    expect(readFileSync(first.path!, 'utf-8')).toContain('Body')
    expect(getAllNotes(vaultPath).map((note) => note.title).sort()).toEqual(['Clip', 'Clip'])
  })
})
