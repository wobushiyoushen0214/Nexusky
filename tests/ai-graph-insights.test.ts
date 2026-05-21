import { describe, expect, it } from 'vitest'
import { findKnowledgeBridgeNotes } from '../packages/main/src/services/ai/graph-insights'
import type { NoteIndex, OutgoingLinkIndex } from '../packages/main/src/services/indexer'

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

describe('findKnowledgeBridgeNotes', () => {
  it('finds notes that connect multiple folders and tags', () => {
    const notes = [
      note('hub', 'Synthesis', 'Synthesis.md'),
      note('research', 'Research Note', 'Research/Research Note.md'),
      note('project', 'Project Plan', 'Projects/Project Plan.md'),
      note('single', 'Single Cluster', 'Research/Single Cluster.md')
    ]
    const outgoingLinksByNoteId = new Map<string, OutgoingLinkIndex[]>([
      ['hub', [
        { targetTitle: 'Research Note', targetPath: 'Research/Research Note.md', line: 1, context: '[[Research Note]]', resolved: true },
        { targetTitle: 'Project Plan', targetPath: 'Projects/Project Plan.md', line: 2, context: '[[Project Plan]]', resolved: true }
      ]],
      ['single', [
        { targetTitle: 'Research Note', targetPath: 'Research/Research Note.md', line: 1, context: '[[Research Note]]', resolved: true }
      ]]
    ])

    const results = findKnowledgeBridgeNotes({
      notes,
      outgoingLinksByNoteId,
      propertyRows: [
        { filePath: 'Research/Research Note.md', properties: { tags: ['research'] } },
        { filePath: 'Projects/Project Plan.md', properties: { tags: ['delivery'] } },
        { filePath: 'Research/Single Cluster.md', properties: { tags: ['research'] } }
      ],
      limit: 5
    })

    expect(results).toEqual([
      {
        title: 'Synthesis',
        filePath: 'Synthesis.md',
        score: 8,
        connections: 2,
        folders: ['Projects', 'Research'],
        tags: ['delivery', 'research']
      }
    ])
  })

  it('does not flag notes whose neighbors stay in one topic cluster', () => {
    const notes = [
      note('hub', 'Research Hub', 'Research/Hub.md'),
      note('a', 'Alpha', 'Research/Alpha.md'),
      note('b', 'Beta', 'Research/Beta.md')
    ]
    const outgoingLinksByNoteId = new Map<string, OutgoingLinkIndex[]>([
      ['hub', [
        { targetTitle: 'Alpha', targetPath: 'Research/Alpha.md', line: 1, context: '[[Alpha]]', resolved: true },
        { targetTitle: 'Beta', targetPath: 'Research/Beta.md', line: 2, context: '[[Beta]]', resolved: true }
      ]]
    ])

    expect(findKnowledgeBridgeNotes({
      notes,
      outgoingLinksByNoteId,
      propertyRows: [
        { filePath: 'Research/Alpha.md', properties: { tags: ['research'] } },
        { filePath: 'Research/Beta.md', properties: { tags: ['research'] } }
      ]
    })).toEqual([])
  })
})
