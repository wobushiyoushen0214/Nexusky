import { describe, expect, it } from 'vitest'
import { buildKnowledgeMaintenanceQueue } from '../packages/main/src/services/ai/maintenance-queue'
import type { OutgoingLinkIndex } from '../packages/main/src/services/indexer'

describe('buildKnowledgeMaintenanceQueue', () => {
  it('prioritizes broken links, isolated notes, unlinked mentions, and bridge maintenance', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [
        { id: 'broken', title: 'Broken Source', filePath: 'Broken.md', updatedAt: 1700000000000 },
        { id: 'orphan', title: 'Orphan', filePath: 'Orphan.md', updatedAt: 1700000000001 },
        { id: 'mentioned', title: 'Mentioned', filePath: 'Mentioned.md', updatedAt: 1700000000002 },
        { id: 'bridge', title: 'Synthesis', filePath: 'Synthesis.md', updatedAt: 1700000000003 }
      ],
      outgoingLinksByNoteId: new Map<string, OutgoingLinkIndex[]>([
        ['broken', [{ targetTitle: 'Missing', line: 3, context: 'See [[Missing]]', resolved: false }]],
        ['bridge', [
          { targetTitle: 'A', targetPath: 'A.md', line: 1, context: '[[A]]', resolved: true },
          { targetTitle: 'B', targetPath: 'B.md', line: 2, context: '[[B]]', resolved: true }
        ]]
      ]),
      backlinkCountByNoteId: new Map([
        ['broken', 1],
        ['orphan', 0],
        ['mentioned', 1],
        ['bridge', 2]
      ]),
      unlinkedMentionCountByNoteId: new Map([
        ['mentioned', 3]
      ]),
      bridges: [
        { title: 'Synthesis', filePath: 'Synthesis.md', score: 8, connections: 2, folders: ['Projects', 'Research'], tags: ['delivery', 'research'] }
      ],
      limit: 10
    })

    expect(queue.map((item) => item.type)).toEqual([
      'fix_unresolved_link',
      'connect_orphan',
      'link_unlinked_reference',
      'maintain_bridge'
    ])
    expect(queue[0]).toMatchObject({
      title: 'Broken Source',
      action: 'Resolve or create [[Missing]]'
    })
    expect(queue[3]).toMatchObject({
      title: 'Synthesis',
      detail: 'Folders: Projects, Research; tags: delivery, research'
    })
  })

  it('filters maintenance items by query', () => {
    const queue = buildKnowledgeMaintenanceQueue({
      notes: [{ id: 'a', title: 'Alpha', filePath: 'Alpha.md', updatedAt: 1700000000000 }],
      outgoingLinksByNoteId: new Map([
        ['a', [{ targetTitle: 'Missing Project', line: 1, context: '[[Missing Project]]', resolved: false }]]
      ]),
      backlinkCountByNoteId: new Map([['a', 1]]),
      unlinkedMentionCountByNoteId: new Map(),
      bridges: [],
      query: 'project'
    })

    expect(queue).toHaveLength(1)
    expect(buildKnowledgeMaintenanceQueue({
      notes: [{ id: 'a', title: 'Alpha', filePath: 'Alpha.md', updatedAt: 1700000000000 }],
      outgoingLinksByNoteId: new Map([
        ['a', [{ targetTitle: 'Missing Project', line: 1, context: '[[Missing Project]]', resolved: false }]]
      ]),
      backlinkCountByNoteId: new Map([['a', 1]]),
      unlinkedMentionCountByNoteId: new Map(),
      bridges: [],
      query: 'archive'
    })).toEqual([])
  })
})
