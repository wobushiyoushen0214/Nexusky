import { describe, expect, it } from 'vitest'
import { findConnectionOpportunities } from '../packages/main/src/services/ai/connection-opportunities'
import type { NoteIndex, OutgoingLinkIndex } from '../packages/main/src/services/indexer'
import type { NoteMemory } from '../packages/main/src/services/memory'

function note(id: string, title: string, filePath: string): NoteIndex {
  return {
    id,
    title,
    filePath,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    contentHash: `${id}-hash`
  }
}

function memory(noteId: string, title: string, concepts: string[], topics: string[] = []): NoteMemory {
  return {
    noteId,
    title,
    folder: '_root',
    contentHash: `${noteId}-hash`,
    concepts,
    topics,
    summary: '',
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  }
}

describe('findConnectionOpportunities', () => {
  it('finds unlinked notes that share tags, properties, and memory concepts', () => {
    const notes = [
      note('a', 'Knowledge Graphs', 'Research/Knowledge Graphs.md'),
      note('b', 'AI Notes', 'Projects/AI Notes.md'),
      note('c', 'Linked Graph', 'Research/Linked Graph.md')
    ]
    const outgoingLinksByNoteId = new Map<string, OutgoingLinkIndex[]>([
      ['a', [{ targetTitle: 'Linked Graph', targetPath: 'Research/Linked Graph.md', line: 1, context: '[[Linked Graph]]', resolved: true }]]
    ])

    const results = findConnectionOpportunities({
      notes,
      outgoingLinksByNoteId,
      propertyRows: [
        { title: 'Knowledge Graphs', filePath: 'Research/Knowledge Graphs.md', properties: { tags: ['ai'], project: 'Nexusky' } },
        { title: 'AI Notes', filePath: 'Projects/AI Notes.md', properties: { tags: ['ai'], project: 'Nexusky' } },
        { title: 'Linked Graph', filePath: 'Research/Linked Graph.md', properties: { tags: ['ai'] } }
      ],
      memories: [
        memory('a', 'Knowledge Graphs', ['Knowledge Graph']),
        memory('b', 'AI Notes', ['Knowledge Graph']),
        memory('c', 'Linked Graph', ['Knowledge Graph'])
      ],
      limit: 5
    })

    expect(results.map((result) => `${result.sourcePath}->${result.targetPath}`)).toEqual([
      'Research/Knowledge Graphs.md->Projects/AI Notes.md',
      'Projects/AI Notes.md->Research/Linked Graph.md'
    ])
    expect(results[0].reasons).toEqual([
      'shared tag: #ai',
      'shared property: project=Nexusky',
      'shared concept: Knowledge Graph'
    ])
    expect(results[0]).toMatchObject({
      suggestedSourcePath: 'Projects/AI Notes.md',
      suggestedTargetPath: 'Research/Knowledge Graphs.md',
      suggestedWikilink: '[[Research/Knowledge Graphs]]'
    })
    expect(results.some((result) => result.targetPath === 'Research/Linked Graph.md' && result.sourcePath === 'Research/Knowledge Graphs.md')).toBe(false)
  })

  it('does not suggest notes that only share a folder', () => {
    const notes = [
      note('a', 'One', 'Research/One.md'),
      note('b', 'Two', 'Research/Two.md')
    ]

    expect(findConnectionOpportunities({
      notes,
      outgoingLinksByNoteId: new Map(),
      propertyRows: [],
      limit: 5
    })).toEqual([])
  })
})
