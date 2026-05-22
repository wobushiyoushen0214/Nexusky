import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('long-context relation candidates', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-candidates-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  async function indexFiles(files: Record<string, string>): Promise<Record<string, string>> {
    const { indexNote, getAllNotes } = await import('../packages/main/src/services/indexer')
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = join(vaultPath, relativePath)
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content)
      indexNote(vaultPath, filePath)
    }

    return Object.fromEntries(getAllNotes(vaultPath).map((note) => [note.title, note.id]))
  }

  it('ranks explicit links above ordinary keyword hits', async () => {
    const ids = await indexFiles({
      'Linked Context.md': '# Linked Context\n\nMCP tool notes with concrete implementation details.',
      'Archive/Keyword Hit.md': '# Keyword Hit\n\nAI automation workflow research with no explicit link.',
      'Current.md': '# Current\n\n[[Linked Context]]\n\nWorking on an AI automation workflow today.'
    })
    const { findRelationCandidates } = await import('../packages/main/src/services/long-context/relation-candidates')

    const candidates = findRelationCandidates({
      vaultPath,
      entityType: 'note',
      entityId: ids.Current,
      limit: 20
    })
    const linked = candidates.find((candidate) => candidate.targetTitle === 'Linked Context')
    const keyword = candidates.find((candidate) => candidate.targetTitle === 'Keyword Hit')

    expect(linked?.signals).toContain('explicit_link')
    expect(keyword?.signals.some((signal) => signal.startsWith('fts_keyword') || signal.startsWith('title_keyword'))).toBe(true)
    expect(linked?.localScore).toBeGreaterThan(keyword?.localScore || 0)
  })

  it('recalls notes with overlapping tags and properties', async () => {
    const ids = await indexFiles({
      'Current.md': [
        '---',
        'project: alpha',
        '---',
        '# Current',
        '',
        'Planning long context retrieval. #long-context'
      ].join('\n'),
      'Tagged.md': '# Tagged\n\nHistorical context for retrieval. #long-context',
      'Property.md': [
        '---',
        'project: alpha',
        '---',
        '# Property',
        '',
        'A prior project note without shared tags.'
      ].join('\n')
    })
    const { findRelationCandidates } = await import('../packages/main/src/services/long-context/relation-candidates')

    const candidates = findRelationCandidates({
      vaultPath,
      entityType: 'note',
      entityId: ids.Current,
      limit: 20
    })
    const tagged = candidates.find((candidate) => candidate.targetTitle === 'Tagged')
    const property = candidates.find((candidate) => candidate.targetTitle === 'Property')

    expect(tagged?.signals).toEqual(expect.arrayContaining(['tag:long-context']))
    expect(property?.signals).toEqual(expect.arrayContaining(['property:project']))
  })

  it('recalls chunk-similar notes without calling an AI provider', async () => {
    const ids = await indexFiles({
      'Current.md': '# Current\n\nAgent orchestration routes external tool calls through a planner.',
      'Archive/Semantic.md': '# Semantic\n\nExternal tools can be coordinated by an agent planner for orchestration and routing.',
      'Archive/Unrelated.md': '# Unrelated\n\nGarden recipes and grocery planning.'
    })
    const { indexNoteEmbeddings } = await import('../packages/main/src/services/embedding')
    const { findRelationCandidates } = await import('../packages/main/src/services/long-context/relation-candidates')
    await indexNoteEmbeddings(vaultPath, ids.Semantic, 'External tools can be coordinated by an agent planner for orchestration and routing.')
    await indexNoteEmbeddings(vaultPath, ids.Unrelated, 'Garden recipes and grocery planning.')

    const candidates = findRelationCandidates({
      vaultPath,
      entityType: 'note',
      entityId: ids.Current,
      limit: 20
    })
    const semantic = candidates.find((candidate) => candidate.targetTitle === 'Semantic')
    const semanticIndex = candidates.findIndex((candidate) => candidate.targetTitle === 'Semantic')
    const unrelatedIndex = candidates.findIndex((candidate) => candidate.targetTitle === 'Unrelated')

    expect(semantic?.signals).toContain('semantic_chunk')
    expect(unrelatedIndex === -1 || semanticIndex < unrelatedIndex).toBe(true)
  })

  it('returns candidates in a stable order', async () => {
    const ids = await indexFiles({
      'Current.md': '# Current\n\nAI workflow context and retrieval notes. #stable',
      'Beta.md': '# Beta\n\nAI workflow context. #stable',
      'Alpha.md': '# Alpha\n\nAI workflow retrieval. #stable'
    })
    const { findRelationCandidates } = await import('../packages/main/src/services/long-context/relation-candidates')

    const first = findRelationCandidates({ vaultPath, entityType: 'note', entityId: ids.Current, limit: 20 })
    const second = findRelationCandidates({ vaultPath, entityType: 'note', entityId: ids.Current, limit: 20 })

    expect(second.map((candidate) => candidate.targetId)).toEqual(first.map((candidate) => candidate.targetId))
    expect(first[0].targetTitle).toBe('Alpha')
  })
})
