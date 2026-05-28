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
    mkdirSync(join(vaultPath, 'Folder', 'Sub'), { recursive: true })
    mkdirSync(join(vaultPath, 'Other'), { recursive: true })
    const ePath = join(vaultPath, 'Folder', 'Sub', 'E.md')
    const fPath = join(vaultPath, 'Other', 'F.md')

    writeFileSync(aPath, '# A\n\nLinks to [[B]].')
    writeFileSync(bPath, '# B\n\nLinks to [[Folder/C]].')
    writeFileSync(cPath, '# C\n\nNo outgoing links.')
    writeFileSync(dPath, '# D\n\nIsolated note with no wikilinks.')
    writeFileSync(ePath, '# E\n\nNested note.')
    writeFileSync(fPath, '# F\n\nOther group note.')

    for (const p of [aPath, bPath, cPath, dPath, ePath, fPath]) indexNote(vaultPath, p)

    const db = getDatabase(vaultPath)
    const all = getAllNotes(vaultPath)
    const byTitle = (t: string) => all.find((n) => n.title === t)!

    db.prepare("INSERT INTO links (source_note_id, target_title, context, link_type) VALUES (?, ?, ?, 'inferred')").run(
      byTitle('A').id,
      'D',
      'similarity: 80%',
    )
    db.prepare("INSERT INTO links (source_note_id, target_title, context, link_type) VALUES (?, ?, ?, 'inferred')").run(
      byTitle('C').id,
      'E',
      'similarity: 90%',
    )
    db.prepare("INSERT INTO links (source_note_id, target_title, context, link_type) VALUES (?, ?, ?, 'inferred')").run(
      byTitle('C').id,
      'F',
      'similarity: 85%',
    )
    const { resolveAllLinks } = await import('../packages/main/src/services/indexer')
    resolveAllLinks(vaultPath)

    return { closeDatabase, byTitle }
  }

  it('folder mode returns a flat file-only graph carrying folder metadata plus explicit and inferred relation edges', async () => {
    const { getGraphData } = await import('../packages/main/src/services/indexer')
    const { closeDatabase, byTitle } = await setupVault()

    const graph = getGraphData(vaultPath, 'folder')

    expect(graph.nodes.every((n) => n.type === 'file')).toBe(true)
    expect(graph.nodes.some((n) => n.id === byTitle('A').id && n.folder === '')).toBe(true)
    expect(graph.nodes.some((n) => n.id === byTitle('C').id && n.folder === 'Folder')).toBe(true)
    expect(graph.nodes.some((n) => n.id === byTitle('E').id && n.folder === 'Folder/Sub')).toBe(true)
    expect(graph.edges.every((e) => e.linkType !== 'folder')).toBe(true)
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: byTitle('A').id, target: byTitle('B').id, linkType: 'explicit' }))
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: byTitle('B').id, target: byTitle('C').id, linkType: 'explicit' }))
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

  it('group mode returns top-level groups without child file nodes and aggregates cross-group AI edges', async () => {
    const { getGraphData } = await import('../packages/main/src/services/indexer')
    const { closeDatabase } = await setupVault()

    const graph = getGraphData(vaultPath, 'group')

    expect(graph.nodes.every((n) => n.type === 'folder')).toBe(true)
    expect(graph.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['folder:.', 'folder:Folder', 'folder:Other']))
    expect(graph.nodes.some((n) => n.type === 'file')).toBe(false)
    expect(graph.edges.every((e) => e.linkType === 'inferred')).toBe(true)
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: 'folder:Folder',
      target: 'folder:Other',
      linkType: 'inferred',
      weight: 1,
    }))

    closeDatabase()
  })

  it('folder-scope mode flattens all descendant folders and files in the selected folder', async () => {
    const { getGraphData } = await import('../packages/main/src/services/indexer')
    const { closeDatabase, byTitle } = await setupVault()

    const graph = getGraphData(vaultPath, 'folder-scope', 'Folder')

    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: 'folder:Folder', type: 'folder', filePath: 'Folder' }))
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: byTitle('C').id, type: 'file', filePath: 'Folder/C.md' }))
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: 'folder:Folder/Sub', type: 'folder', filePath: 'Folder/Sub', noteCount: 1 }))
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: byTitle('E').id, type: 'file', filePath: 'Folder/Sub/E.md' }))
    expect(graph.nodes.some((n) => n.id === byTitle('F').id)).toBe(false)
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: 'folder:Folder',
      target: 'folder:Folder/Sub',
      linkType: 'folder',
    }))
    expect(graph.edges).toContainEqual(expect.objectContaining({
      source: byTitle('C').id,
      target: byTitle('E').id,
      linkType: 'inferred',
    }))
    expect(graph.edges.some((edge) => edge.linkType === 'explicit')).toBe(false)
    expect(graph.edges.some((e) => e.source === 'folder:Other' || e.target === 'folder:Other' || e.source === byTitle('F').id || e.target === byTitle('F').id)).toBe(false)

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
    expect(graph.nodes.every((n) => n.type === 'file')).toBe(true)
    expect(graph.nodes.some((n) => typeof n.folder === 'string')).toBe(true)

    closeDatabase()
  })
})
