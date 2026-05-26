import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('getGraphData modes', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-graph-modes-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true })
  })

  async function setupVault() {
    const { indexNote, getAllNotes } = await import('../packages/main/src/services/indexer')
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')

    mkdirSync(join(vaultPath, 'Folder'), { recursive: true })
    const aPath = join(vaultPath, 'A.md')
    const bPath = join(vaultPath, 'B.md')
    const cPath = join(vaultPath, 'Folder', 'C.md')
    const dPath = join(vaultPath, 'D.md')

    writeFileSync(aPath, '# A\n\nLinks to [[B]].')
    writeFileSync(bPath, '# B\n\nLinks to [[Folder/C]].')
    writeFileSync(cPath, '# C\n\nNo outgoing links.')
    writeFileSync(dPath, '# D\n\nIsolated note with no wikilinks.')

    for (const p of [aPath, bPath, cPath, dPath]) indexNote(vaultPath, p)

    const db = getDatabase(vaultPath)
    const all = getAllNotes(vaultPath)
    const byTitle = (t: string) => all.find((n) => n.title === t)!

    db.prepare("INSERT INTO links (source_note_id, target_title, context, link_type) VALUES (?, ?, ?, 'inferred')").run(
      byTitle('A').id,
      'D',
      'similarity: 80%',
    )
    const { resolveAllLinks } = await import('../packages/main/src/services/indexer')
    resolveAllLinks(vaultPath)

    return { closeDatabase, byTitle }
  }

  it('folder mode returns folder nodes + folder→file edges + explicit and inferred edges', async () => {
    const { getGraphData } = await import('../packages/main/src/services/indexer')
    const { closeDatabase, byTitle } = await setupVault()

    const graph = getGraphData(vaultPath, 'folder')

    expect(graph.nodes.some((n) => n.type === 'folder' && n.filePath === 'Folder')).toBe(true)
    expect(graph.edges).toContainEqual(expect.objectContaining({ linkType: 'folder' }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: byTitle('A').id, target: byTitle('B').id, linkType: 'explicit' }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: byTitle('A').id, target: byTitle('D').id, linkType: 'inferred' }))

    closeDatabase()
  })

  it('semantic mode drops folder nodes but keeps explicit + inferred edges', async () => {
    const { getGraphData } = await import('../packages/main/src/services/indexer')
    const { closeDatabase, byTitle } = await setupVault()

    const graph = getGraphData(vaultPath, 'semantic')

    expect(graph.nodes.every((n) => n.type === 'file')).toBe(true)
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: byTitle('A').id, target: byTitle('B').id, linkType: 'explicit' }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: byTitle('A').id, target: byTitle('D').id, linkType: 'inferred' }))
    expect(graph.edges.every((e) => e.linkType !== 'folder')).toBe(true)

    closeDatabase()
  })

  it('connection mode keeps only explicit-linked notes and explicit edges', async () => {
    const { getGraphData } = await import('../packages/main/src/services/indexer')
    const { closeDatabase, byTitle } = await setupVault()

    const graph = getGraphData(vaultPath, 'connection')

    expect(graph.nodes.every((n) => n.type === 'file')).toBe(true)
    expect(graph.nodes.some((n) => n.id === byTitle('A').id)).toBe(true)
    expect(graph.nodes.some((n) => n.id === byTitle('B').id)).toBe(true)
    expect(graph.nodes.some((n) => n.id === byTitle('C').id)).toBe(true)
    expect(graph.nodes.some((n) => n.id === byTitle('D').id)).toBe(false)
    expect(graph.edges.every((e) => e.linkType === 'explicit')).toBe(true)

    closeDatabase()
  })

  it('default mode is folder (backward compatibility)', async () => {
    const { getGraphData } = await import('../packages/main/src/services/indexer')
    const { closeDatabase } = await setupVault()

    const graph = getGraphData(vaultPath)
    expect(graph.nodes.some((n) => n.type === 'folder')).toBe(true)

    closeDatabase()
  })
})
