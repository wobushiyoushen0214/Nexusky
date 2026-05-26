import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('memory-backed graph links', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-memory-links-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('derives inferred graph edges from stored note memories', async () => {
    const { indexNote, getAllNotes, getGraphData } = await import('../packages/main/src/services/indexer')
    const { getMemoryPath } = await import('../packages/main/src/services/memory')
    const { refreshInferredLinksFromMemory } = await import('../packages/main/src/services/memory-links')

    mkdirSync(join(vaultPath, 'Research'), { recursive: true })
    mkdirSync(join(vaultPath, 'Projects'), { recursive: true })
    const aPath = join(vaultPath, 'Research', 'Knowledge Graphs.md')
    const bPath = join(vaultPath, 'Projects', 'AI Notes.md')
    writeFileSync(aPath, '# Knowledge Graphs\n\nGraph databases and semantic memory.')
    writeFileSync(bPath, '# AI Notes\n\nSemantic memory for graph navigation.')
    indexNote(vaultPath, aPath)
    indexNote(vaultPath, bPath)

    const notes = getAllNotes(vaultPath)
    const a = notes.find((note) => note.title === 'Knowledge Graphs')!
    const b = notes.find((note) => note.title === 'AI Notes')!
    writeMemory(a.id, a.title, 'Research', a.contentHash, ['Knowledge Graph', 'Semantic Memory'])
    writeMemory(b.id, b.title, 'Projects', b.contentHash, ['Knowledge Graph', 'Semantic Memory'])

    const result = refreshInferredLinksFromMemory(vaultPath)
    const graph = getGraphData(vaultPath, 'folder')

    expect(result.added).toBe(1)
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: a.id,
      target: b.id,
      linkType: 'inferred'
    }))

    function writeMemory(noteId: string, title: string, folder: string, contentHash: string, concepts: string[]) {
      writeFileSync(getMemoryPath(vaultPath, noteId), JSON.stringify({
        noteId,
        title,
        folder,
        contentHash,
        concepts,
        topics: ['Knowledge Management'],
        summary: `${title} summary`,
        createdAt: 1,
        updatedAt: 1
      }), 'utf-8')
    }
  })

  it('uses current note titles and ignores memories for missing notes', async () => {
    const { indexNote, getAllNotes, getGraphData } = await import('../packages/main/src/services/indexer')
    const { getMemoryPath } = await import('../packages/main/src/services/memory')
    const { refreshInferredLinksFromMemory } = await import('../packages/main/src/services/memory-links')

    const aPath = join(vaultPath, 'A.md')
    const bPath = join(vaultPath, 'B.md')
    writeFileSync(aPath, '# A\n\nShared concept.')
    writeFileSync(bPath, '# B\n\nShared concept.')
    indexNote(vaultPath, aPath)
    indexNote(vaultPath, bPath)

    const notes = getAllNotes(vaultPath)
    const a = notes.find((note) => note.title === 'A')!
    const b = notes.find((note) => note.title === 'B')!
    writeMemory(a.id, 'A', a.contentHash, ['Shared Concept'])
    writeMemory(b.id, 'Old B Title', b.contentHash, ['Shared Concept'])
    writeMemory('missing-note', 'Missing', 'missing-hash', ['Shared Concept'])

    const result = refreshInferredLinksFromMemory(vaultPath)
    const graph = getGraphData(vaultPath, 'folder')

    expect(result.added).toBe(1)
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: a.id,
      target: b.id,
      linkType: 'inferred'
    }))

    function writeMemory(noteId: string, title: string, contentHash: string, concepts: string[]) {
      writeFileSync(getMemoryPath(vaultPath, noteId), JSON.stringify({
        noteId,
        title,
        folder: '_root',
        contentHash,
        concepts,
        topics: ['Knowledge Management'],
        summary: `${title} summary`,
        createdAt: 1,
        updatedAt: 1
      }), 'utf-8')
    }
  })
})
