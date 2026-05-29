import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { chunkText } from '../packages/main/src/services/search-index'

describe('chunkText', () => {
  it('should split content into chunks', () => {
    const content = 'Line 1\n'.repeat(200)
    const chunks = chunkText(content, 'test-note')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].noteId).toBe('test-note')
    expect(chunks[0].chunkIndex).toBe(0)
  })

  it('should preserve heading context', () => {
    const content = '# Title\n\nSome content here.\n\n## Section\n\n' + 'More text. '.repeat(100)
    const chunks = chunkText(content, 'note-1')
    const lastChunk = chunks[chunks.length - 1]
    expect(lastChunk.headingContext).toBe('Section')
  })

  it('should handle empty content', () => {
    const chunks = chunkText('', 'empty')
    expect(chunks).toHaveLength(0)
  })

  it('should handle short content as single chunk', () => {
    const chunks = chunkText('Hello world', 'short')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Hello world')
  })
})

describe('lexicalSearch', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-lexical-search-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('falls back to indexed note text before search chunks are generated', async () => {
    const { indexNote } = await import('../packages/main/src/services/indexer')
    const { lexicalSearch } = await import('../packages/main/src/services/search-index')

    const filePath = join(vaultPath, 'Project.md')
    writeFileSync(filePath, '# Project\n\nThis note mentions lexical fallback search for agent tools.')
    indexNote(vaultPath, filePath)

    const results = await lexicalSearch(vaultPath, 'lexical fallback', 5)

    expect(results[0]).toMatchObject({
      title: 'Project',
      filePath: 'Project.md'
    })
    expect(results[0].chunk).toContain('lexical fallback')
  })

  it('matches fallback search terms even when they are not adjacent', async () => {
    const { indexNote } = await import('../packages/main/src/services/indexer')
    const { lexicalSearch } = await import('../packages/main/src/services/search-index')

    const filePath = join(vaultPath, 'Agent Search.md')
    writeFileSync(filePath, '# Agent Search\n\nFallback search should still work for agent note tools.')
    indexNote(vaultPath, filePath)

    const results = await lexicalSearch(vaultPath, 'agent fallback', 5)

    expect(results[0]).toMatchObject({
      title: 'Agent Search',
      filePath: 'Agent Search.md'
    })
  })

  it('reports whether search chunks changed', async () => {
    const { getAllNotes, indexNote } = await import('../packages/main/src/services/indexer')
    const { indexNoteSearchChunks } = await import('../packages/main/src/services/search-index')

    const filePath = join(vaultPath, 'Chunk Status.md')
    const content = '# Chunk Status\n\nLocal search chunks only change when content changes.'
    writeFileSync(filePath, content)
    indexNote(vaultPath, filePath)
    const note = getAllNotes(vaultPath).find((item) => item.filePath === 'Chunk Status.md')!

    await expect(indexNoteSearchChunks(vaultPath, note.id, content)).resolves.toBe(true)
    await expect(indexNoteSearchChunks(vaultPath, note.id, content)).resolves.toBe(false)
  })
})
