import { describe, expect, it } from 'vitest'
import { formatConnectionOpportunitiesToolResult, formatCurrentNoteLinkStatsToolResult, formatCurrentNotePropertiesToolResult, formatCurrentNoteUnlinkedReferencesToolResult, formatDeadEndNotesToolResult, formatDuplicateAliasesToolResult, formatDuplicateNoteTitlesToolResult, formatEmptyNotesToolResult, formatFindTextInNoteToolResult, formatKnowledgeBridgesToolResult, formatLargeNotesToolResult, formatLinkHubsToolResult, formatListFoldersToolResult, formatListPropertiesToolResult, formatListTagsToolResult, formatListTasksToolResult, formatMemoryFoldersToolResult, formatMemoryOverviewToolResult, formatMemoryRelatedNotesToolResult, formatMemoryTermPairsToolResult, formatMemoryTermsToolResult, formatMissingMemoryNotesToolResult, formatMissingPropertyNotesToolResult, formatNoteBlocksToolResult, formatNoteHeadingsToolResult, formatNoteLinksToolResult, formatNoteMemoriesToolResult, formatNotesByFolderToolResult, formatNotesByMemoryTermToolResult, formatNotesByPropertyToolResult, formatNotesByTagToolResult, formatOrphanNotesToolResult, formatPropertyValue, formatPropertyValuesToolResult, formatReadNoteLinesToolResult, formatReadNoteMemoryToolResult, formatReadNoteToolResult, formatRecentNotesToolResult, formatSearchNotesToolResult, formatSimilarNotesToolResult, formatUntaggedNotesToolResult, formatUnreferencedNotesToolResult, formatUnresolvedLinksToolResult, formatVaultOverviewToolResult } from '../packages/main/src/services/ai/search-results'

describe('formatSearchNotesToolResult', () => {
  it('includes file paths so the agent can disambiguate read_note calls', () => {
    const output = formatSearchNotesToolResult([
      { title: 'Topic', filePath: 'A/Topic.md', chunk: 'First result content.' },
      { title: 'Topic', filePath: 'B/Topic.md', chunk: 'Second result content.' }
    ])

    expect(output).toContain('1. **Topic**')
    expect(output).toContain('Path: A/Topic.md')
    expect(output).toContain('Path: B/Topic.md')
  })

  it('limits long chunks in tool output', () => {
    const output = formatSearchNotesToolResult([
      { title: 'Long', filePath: 'Long.md', chunk: 'x'.repeat(260) }
    ])

    expect(output).toHaveLength('1. **Long**\nPath: Long.md\n'.length + 200)
  })
})

describe('formatReadNoteToolResult', () => {
  it('includes title and path before note content', () => {
    const output = formatReadNoteToolResult({
      title: 'Topic',
      filePath: 'A/Topic.md',
      content: '# Topic\n\nBody.'
    })

    expect(output).toBe('Title: Topic\nPath: A/Topic.md\n\n# Topic\n\nBody.')
  })

  it('marks empty notes explicitly', () => {
    const output = formatReadNoteToolResult({
      title: 'Empty',
      filePath: 'Empty.md',
      content: '   '
    })

    expect(output).toBe('Title: Empty\nPath: Empty.md\n\n(empty note)')
  })

  it('includes section metadata when reading a note section', () => {
    const output = formatReadNoteToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      section: 'Details',
      content: '## Details\nBody.'
    })

    expect(output).toBe('Title: Topic\nPath: Topic.md\nSection: Details\n\n## Details\nBody.')
  })

  it('includes block metadata when reading a note block', () => {
    const output = formatReadNoteToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      blockId: 'todo-1',
      content: '- Task body'
    })

    expect(output).toBe('Title: Topic\nPath: Topic.md\nBlock: ^todo-1\n\n- Task body')
  })
})

describe('formatReadNoteLinesToolResult', () => {
  it('includes title, path, and line range before content', () => {
    const output = formatReadNoteLinesToolResult({
      title: 'Topic',
      filePath: 'A/Topic.md',
      startLine: 3,
      endLine: 5,
      content: 'Line 3\nLine 4\nLine 5'
    })

    expect(output).toBe('Title: Topic\nPath: A/Topic.md\nLines: 3-5\n\nLine 3\nLine 4\nLine 5')
  })

  it('marks empty line ranges explicitly', () => {
    const output = formatReadNoteLinesToolResult({
      title: 'Empty',
      filePath: 'Empty.md',
      startLine: 1,
      endLine: 1,
      content: '   '
    })

    expect(output).toBe('Title: Empty\nPath: Empty.md\nLines: 1-1\n\n(empty range)')
  })
})

describe('formatNoteLinksToolResult', () => {
  it('formats outgoing links and backlinks with paths', () => {
    const output = formatNoteLinksToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      outgoing: [
        { targetTitle: 'Next', targetPath: 'Folder/Next.md', line: 4, context: 'See [[Next]] for details.', resolved: true },
        { targetTitle: 'Missing', line: 5, context: 'See [[Missing]].', resolved: false }
      ],
      backlinks: [
        { sourceTitle: 'Source', sourcePath: 'Source.md', line: 6, context: 'References [[Topic]].' }
      ],
      unlinkedMentions: [
        { sourceTitle: 'Loose', sourcePath: 'Loose.md', line: 7, context: 'Topic appears without a link.', mention: 'Topic' }
      ]
    })

    expect(output).toContain('Title: Topic')
    expect(output).toContain('Path: Topic.md')
    expect(output).toContain('1. Next (Folder/Next.md:4) - See [[Next]] for details.')
    expect(output).toContain('2. Missing (unresolved:5) - See [[Missing]].')
    expect(output).toContain('1. Source (Source.md:6) - References [[Topic]].')
    expect(output).toContain('1. Loose (Loose.md:7) - "Topic" - Topic appears without a link.')
  })

  it('marks empty link sections explicitly', () => {
    const output = formatNoteLinksToolResult({
      title: 'Solo',
      filePath: 'Solo.md',
      outgoing: [],
      backlinks: []
    })

    expect(output).toBe('Title: Solo\nPath: Solo.md\n\nOutgoing:\n(none)\n\nBacklinks:\n(none)\n\nUnlinked Mentions:\n(none)')
  })

  it('formats current note link stats with relationship signals', () => {
    const output = formatCurrentNoteLinkStatsToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      outgoing: 2,
      resolvedOutgoing: 1,
      unresolvedOutgoing: 1,
      backlinks: 0,
      unlinkedMentions: 3
    })

    expect(output).toBe('Current Note Link Summary: Topic\nPath: Topic.md\nOutgoing: 2 (1 resolved, 1 unresolved)\nBacklinks: 0\nUnlinked Mentions: 3\nSignals: unreferenced, has unresolved links, has unlinked mentions')
  })

  it('marks current note link stats as connected when no signal applies', () => {
    const output = formatCurrentNoteLinkStatsToolResult({
      title: 'Connected',
      filePath: 'Connected.md',
      outgoing: 2,
      resolvedOutgoing: 2,
      unresolvedOutgoing: 0,
      backlinks: 1,
      unlinkedMentions: 0
    })

    expect(output).toContain('Signals: connected')
  })

  it('formats current note unlinked references with target paths and mentions', () => {
    const output = formatCurrentNoteUnlinkedReferencesToolResult({
      title: 'Planning',
      filePath: 'Planning.md',
      references: [
        { targetTitle: 'Project', targetPath: 'Project.md', line: 3, mention: 'Project', context: 'Project needs a clearer roadmap.' }
      ]
    })

    expect(output).toBe('Current Note Unlinked References: Planning\nPath: Planning.md\n\n1. Project (Project.md:3) - "Project" - Project needs a clearer roadmap.')
  })

  it('marks empty current note unlinked references explicitly', () => {
    expect(formatCurrentNoteUnlinkedReferencesToolResult({ title: 'Linked', filePath: 'Linked.md', references: [] })).toBe('No unlinked note references found in Linked (Linked.md).')
  })
})

describe('formatFindTextInNoteToolResult', () => {
  it('formats text matches with line numbers and contexts', () => {
    const output = formatFindTextInNoteToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      query: 'needle',
      matches: [
        { line: 7, context: 'A line with needle inside.' },
        { line: 12, context: 'Another Needle line.' }
      ]
    })

    expect(output).toBe('Title: Topic\nPath: Topic.md\nQuery: needle\n\nMatches:\n1. Line 7 - A line with needle inside.\n2. Line 12 - Another Needle line.')
  })

  it('marks empty text matches explicitly', () => {
    const output = formatFindTextInNoteToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      query: 'missing',
      matches: []
    })

    expect(output).toBe('No matches found for "missing" in Topic (Topic.md).')
  })
})

describe('formatNoteHeadingsToolResult', () => {
  it('formats note headings with levels and line numbers', () => {
    const output = formatNoteHeadingsToolResult({
      title: 'Topic',
      filePath: 'Notes/Topic.md',
      headings: [
        { level: 1, text: 'Topic', line: 1 },
        { level: 2, text: 'Details', line: 5 }
      ]
    })

    expect(output).toBe('Title: Topic\nPath: Notes/Topic.md\n\nHeadings:\n1. # Topic (line 1)\n2. ## Details (line 5)')
  })

  it('marks notes without headings explicitly', () => {
    const output = formatNoteHeadingsToolResult({
      title: 'Plain',
      filePath: 'Plain.md',
      headings: []
    })

    expect(output).toBe('No headings found for Plain (Plain.md).')
  })
})

describe('formatNoteBlocksToolResult', () => {
  it('formats note block references with ids, lines, and previews', () => {
    const output = formatNoteBlocksToolResult({
      title: 'Topic',
      filePath: 'Notes/Topic.md',
      blocks: [
        { id: 'p1', line: 3, preview: 'First paragraph.' },
        { id: 'todo-1', line: 8, preview: '- Task body' }
      ]
    })

    expect(output).toBe('Title: Topic\nPath: Notes/Topic.md\n\nBlocks:\n1. ^p1 (line 3) - First paragraph.\n2. ^todo-1 (line 8) - - Task body')
  })

  it('marks notes without block references explicitly', () => {
    const output = formatNoteBlocksToolResult({
      title: 'Plain',
      filePath: 'Plain.md',
      blocks: []
    })

    expect(output).toBe('No block references found for Plain (Plain.md).')
  })
})

describe('formatListTasksToolResult', () => {
  it('formats tasks with completion state and source path', () => {
    const output = formatListTasksToolResult([
      { text: 'Review draft', done: false, noteTitle: 'Project', filePath: 'Project.md' },
      { text: 'Ship release', done: true, noteTitle: 'Release', filePath: 'Work/Release.md' }
    ])

    expect(output).toBe('1. [ ] Review draft\nNote: Project\nPath: Project.md\n\n2. [x] Ship release\nNote: Release\nPath: Work/Release.md')
  })

  it('marks empty task results explicitly', () => {
    expect(formatListTasksToolResult([])).toBe('No tasks found.')
  })
})

describe('formatListTagsToolResult', () => {
  it('formats tags with counts', () => {
    const output = formatListTagsToolResult([
      { name: 'project/research', count: 3 },
      { name: 'area', count: 1 }
    ])

    expect(output).toBe('1. #project/research (3)\n2. #area (1)')
  })

  it('marks empty tag results explicitly', () => {
    expect(formatListTagsToolResult([])).toBe('No tags found.')
  })
})

describe('formatNotesByTagToolResult', () => {
  it('formats tagged notes with paths', () => {
    const output = formatNotesByTagToolResult('project/research', [
      { title: 'Project A', filePath: 'Projects/A.md' },
      { title: 'Project B', filePath: 'Projects/B.md' }
    ])

    expect(output).toBe('Tag: #project/research\n\n1. **Project A**\nPath: Projects/A.md\n\n2. **Project B**\nPath: Projects/B.md')
  })

  it('marks empty tagged note results explicitly', () => {
    expect(formatNotesByTagToolResult('missing', [])).toBe('No notes found for #missing.')
  })
})

describe('property tool formatting', () => {
  it('formats property summaries with sample values', () => {
    const output = formatListPropertiesToolResult([
      { key: 'status', count: 4, sampleValues: ['active', 'paused'] },
      { key: 'priority', count: 2, sampleValues: ['2'] }
    ])

    expect(output).toBe('1. status (4) - examples: active, paused\n2. priority (2) - examples: 2')
  })

  it('formats notes by property with paths and values', () => {
    const output = formatNotesByPropertyToolResult('status', [
      { title: 'Project A', filePath: 'A.md', value: 'active' },
      { title: 'Project B', filePath: 'B.md', value: 'active, blocked' }
    ], 'active')

    expect(output).toBe('Property: status ~= "active"\n\n1. **Project A**\nPath: A.md\nValue: active\n\n2. **Project B**\nPath: B.md\nValue: active, blocked')
  })

  it('formats empty property results explicitly', () => {
    expect(formatListPropertiesToolResult([])).toBe('No properties found.')
    expect(formatNotesByPropertyToolResult('status', [])).toBe('No notes found with property status.')
    expect(formatNotesByPropertyToolResult('status', [], 'active')).toBe('No notes found for status matching "active".')
  })

  it('stringifies property values for tool output', () => {
    expect(formatPropertyValue(['active', 2, true])).toBe('active, 2, true')
    expect(formatPropertyValue(null)).toBe('')
  })

  it('formats property value summaries with sample paths', () => {
    const output = formatPropertyValuesToolResult('status', [
      { value: 'active', count: 3, samplePaths: ['A.md', 'B.md'] },
      { value: 'paused', count: 1, samplePaths: ['C.md'] }
    ])

    expect(output).toBe('Property Values: status\n\n1. active (3)\nExamples: A.md, B.md\n\n2. paused (1)\nExamples: C.md')
  })

  it('marks empty property value results explicitly', () => {
    expect(formatPropertyValuesToolResult('status', [])).toBe('No values found for property status.')
  })

  it('formats notes missing a property with paths and timestamps', () => {
    const output = formatMissingPropertyNotesToolResult('status', [
      { title: 'Inbox', filePath: 'Inbox.md', updatedAt: 1700000000000 }
    ])

    expect(output).toBe('Missing Property: status\n\n1. **Inbox**\nPath: Inbox.md\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty missing-property results explicitly', () => {
    expect(formatMissingPropertyNotesToolResult('status', [])).toBe('No notes missing property status.')
  })

  it('formats current note properties with path and values', () => {
    const output = formatCurrentNotePropertiesToolResult({
      title: 'Project A',
      filePath: 'Projects/A.md',
      properties: [
        { key: 'aliases', value: 'Alpha, Launch' },
        { key: 'status', value: 'active' },
        { key: 'tags', value: 'project, research' }
      ]
    })

    expect(output).toBe('Current Note Properties: Project A\nPath: Projects/A.md\n\n1. aliases: Alpha, Launch\n2. status: active\n3. tags: project, research')
  })

  it('marks empty current note properties explicitly', () => {
    expect(formatCurrentNotePropertiesToolResult({ title: 'Empty', filePath: 'Empty.md', properties: [] })).toBe('No properties found for Empty (Empty.md).')
  })
})

describe('formatRecentNotesToolResult', () => {
  it('formats recent notes with paths and timestamps', () => {
    const output = formatRecentNotesToolResult([
      { title: 'Today', filePath: 'Daily/Today.md', updatedAt: 1700000000000 },
      { title: 'Project', filePath: 'Project.md', updatedAt: 1700000100000 }
    ])

    expect(output).toBe('1. **Today**\nPath: Daily/Today.md\nUpdated: 2023-11-14T22:13:20.000Z\n\n2. **Project**\nPath: Project.md\nUpdated: 2023-11-14T22:15:00.000Z')
  })

  it('marks empty recent notes explicitly', () => {
    expect(formatRecentNotesToolResult([])).toBe('No recent notes found.')
  })
})

describe('formatUnresolvedLinksToolResult', () => {
  it('formats unresolved links with source paths and context', () => {
    const output = formatUnresolvedLinksToolResult([
      { sourceTitle: 'Source', sourcePath: 'Source.md', targetTitle: 'Missing', context: 'See [[Missing]].' },
      { sourceTitle: 'Other', sourcePath: 'Folder/Other.md', targetTitle: 'Draft', context: '' }
    ])

    expect(output).toBe('1. [[Missing]]\nSource: Source\nPath: Source.md\nContext: See [[Missing]].\n\n2. [[Draft]]\nSource: Other\nPath: Folder/Other.md\nContext: (none)')
  })

  it('marks empty unresolved link results explicitly', () => {
    expect(formatUnresolvedLinksToolResult([])).toBe('No unresolved links found.')
  })
})

describe('formatOrphanNotesToolResult', () => {
  it('formats orphan notes with paths and timestamps', () => {
    const output = formatOrphanNotesToolResult([
      { title: 'Loose', filePath: 'Loose.md', updatedAt: 1700000000000 }
    ])

    expect(output).toBe('1. **Loose**\nPath: Loose.md\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty orphan note results explicitly', () => {
    expect(formatOrphanNotesToolResult([])).toBe('No orphan notes found.')
  })
})

describe('formatUnreferencedNotesToolResult', () => {
  it('formats unreferenced notes with paths and timestamps', () => {
    const output = formatUnreferencedNotesToolResult([
      { title: 'Standalone', filePath: 'Notes/Standalone.md', updatedAt: 1700000000000 }
    ])

    expect(output).toBe('1. **Standalone**\nPath: Notes/Standalone.md\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty unreferenced note results explicitly', () => {
    expect(formatUnreferencedNotesToolResult([])).toBe('No unreferenced notes found.')
  })
})

describe('formatDeadEndNotesToolResult', () => {
  it('formats dead-end notes with paths and timestamps', () => {
    const output = formatDeadEndNotesToolResult([
      { title: 'Conclusion', filePath: 'Notes/Conclusion.md', updatedAt: 1700000000000 }
    ])

    expect(output).toBe('1. **Conclusion**\nPath: Notes/Conclusion.md\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty dead-end note results explicitly', () => {
    expect(formatDeadEndNotesToolResult([])).toBe('No dead-end notes found.')
  })
})

describe('formatLinkHubsToolResult', () => {
  it('formats link hubs with backlink, outgoing, and total counts', () => {
    const output = formatLinkHubsToolResult([
      { title: 'Index', filePath: 'Index.md', backlinks: 4, outgoing: 7, total: 11 }
    ])

    expect(output).toBe('1. **Index**\nPath: Index.md\nBacklinks: 4\nOutgoing: 7\nTotal: 11')
  })

  it('marks empty link hub results explicitly', () => {
    expect(formatLinkHubsToolResult([])).toBe('No link hubs found.')
  })
})

describe('formatSimilarNotesToolResult', () => {
  it('formats similar note pairs with paths and scores', () => {
    const output = formatSimilarNotesToolResult([
      { sourceTitle: 'React', sourcePath: 'Frameworks/React.md', targetTitle: 'Hooks', targetPath: 'Patterns/Hooks.md', score: 0.81234 }
    ])

    expect(output).toBe('1. **React** -> **Hooks**\nSource: Frameworks/React.md\nTarget: Patterns/Hooks.md\nScore: 0.812')
  })

  it('marks empty similar note results explicitly', () => {
    expect(formatSimilarNotesToolResult([])).toBe('No similar notes found.')
  })
})

describe('formatMemoryRelatedNotesToolResult', () => {
  it('formats memory-related note pairs with reason, paths, and scores', () => {
    const output = formatMemoryRelatedNotesToolResult([
      { sourceTitle: 'React', sourcePath: 'Frameworks/React.md', targetTitle: 'State', targetPath: 'Patterns/State.md', reason: '共享概念: State Management', score: 0.45678 }
    ])

    expect(output).toBe('1. **React** -> **State**\nSource: Frameworks/React.md\nTarget: Patterns/State.md\nReason: 共享概念: State Management\nScore: 0.457')
  })

  it('marks empty memory-related note results explicitly', () => {
    expect(formatMemoryRelatedNotesToolResult([])).toBe('No memory-related notes found.')
  })
})

describe('formatConnectionOpportunitiesToolResult', () => {
  it('formats connection opportunities with reasons and score', () => {
    const output = formatConnectionOpportunitiesToolResult([
      {
        sourceTitle: 'Knowledge Graphs',
        sourcePath: 'Research/Knowledge Graphs.md',
        targetTitle: 'AI Notes',
        targetPath: 'Projects/AI Notes.md',
        suggestedSourcePath: 'Projects/AI Notes.md',
        suggestedWikilink: '[[Research/Knowledge Graphs]]',
        reasons: ['shared tag: #ai', 'shared concept: Knowledge Graph'],
        score: 7
      }
    ])

    expect(output).toBe('1. **Knowledge Graphs** -> **AI Notes**\nSource: Research/Knowledge Graphs.md\nTarget: Projects/AI Notes.md\nReasons: shared tag: #ai; shared concept: Knowledge Graph\nScore: 7.0\nSuggested edit: add [[Research/Knowledge Graphs]] to Projects/AI Notes.md')
  })

  it('marks empty connection opportunities explicitly', () => {
    expect(formatConnectionOpportunitiesToolResult([])).toBe('No connection opportunities found.')
  })
})

describe('formatKnowledgeBridgesToolResult', () => {
  it('formats bridge notes with cross-cluster signals', () => {
    const output = formatKnowledgeBridgesToolResult([
      { title: 'Synthesis', filePath: 'Synthesis.md', score: 8, connections: 2, folders: ['Projects', 'Research'], tags: ['delivery', 'research'] }
    ])

    expect(output).toBe('1. **Synthesis**\nPath: Synthesis.md\nBridge Score: 8\nConnections: 2\nNeighbor Folders: Projects, Research\nNeighbor Tags: delivery, research\nSuggested action: maintain this note as a synthesis point across clusters.')
  })

  it('marks empty bridge results explicitly', () => {
    expect(formatKnowledgeBridgesToolResult([])).toBe('No knowledge bridge notes found.')
  })
})

describe('formatNoteMemoriesToolResult', () => {
  it('formats note memories with concepts, topics, summaries, and paths', () => {
    const output = formatNoteMemoriesToolResult([
      {
        title: 'React',
        filePath: 'Frameworks/React.md',
        folder: 'Frameworks',
        concepts: ['React Hooks', 'State Management'],
        topics: ['Frontend Frameworks'],
        summary: 'Covers React component state and hooks.',
        updatedAt: 1700000000000
      }
    ])

    expect(output).toBe('1. **React**\nPath: Frameworks/React.md\nFolder: Frameworks\nConcepts: React Hooks, State Management\nTopics: Frontend Frameworks\nSummary: Covers React component state and hooks.\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty note memory results explicitly', () => {
    expect(formatNoteMemoriesToolResult([])).toBe('No note memories found.')
  })
})

describe('formatReadNoteMemoryToolResult', () => {
  it('formats one note memory with status', () => {
    const output = formatReadNoteMemoryToolResult({
      title: 'React',
      filePath: 'Frameworks/React.md',
      folder: 'Frameworks',
      status: 'stale',
      concepts: ['React Hooks'],
      topics: ['Frontend Frameworks'],
      summary: 'Covers hooks.',
      updatedAt: 1700000000000
    })

    expect(output).toBe('Title: React\nPath: Frameworks/React.md\nFolder: Frameworks\nStatus: stale\nConcepts: React Hooks\nTopics: Frontend Frameworks\nSummary: Covers hooks.\nUpdated: 2023-11-14T22:13:20.000Z')
  })
})

describe('formatMissingMemoryNotesToolResult', () => {
  it('formats missing and stale note memories with paths and reasons', () => {
    const output = formatMissingMemoryNotesToolResult([
      { title: 'Draft', filePath: 'Inbox/Draft.md', reason: 'missing', updatedAt: 1700000000000 },
      { title: 'Changed', filePath: 'Notes/Changed.md', reason: 'stale', updatedAt: 1700000100000 }
    ])

    expect(output).toBe('1. **Draft**\nPath: Inbox/Draft.md\nReason: missing\nUpdated: 2023-11-14T22:13:20.000Z\n\n2. **Changed**\nPath: Notes/Changed.md\nReason: stale\nUpdated: 2023-11-14T22:15:00.000Z')
  })

  it('marks complete memory coverage explicitly', () => {
    expect(formatMissingMemoryNotesToolResult([])).toBe('No missing or stale note memories found.')
  })
})

describe('formatMemoryTermsToolResult', () => {
  it('formats memory concept and topic summaries with examples', () => {
    const output = formatMemoryTermsToolResult([
      { term: 'React Hooks', type: 'concept', count: 3, samplePaths: ['A.md', 'B.md'] },
      { term: 'Frontend Frameworks', type: 'topic', count: 2, samplePaths: ['C.md'] }
    ])

    expect(output).toBe('1. React Hooks (concept, 3)\nExamples: A.md, B.md\n\n2. Frontend Frameworks (topic, 2)\nExamples: C.md')
  })

  it('marks empty memory terms explicitly', () => {
    expect(formatMemoryTermsToolResult([])).toBe('No memory terms found.')
  })
})

describe('formatNotesByMemoryTermToolResult', () => {
  it('formats notes matching a memory term with paths and summaries', () => {
    const output = formatNotesByMemoryTermToolResult('React Hooks', [
      {
        title: 'React',
        filePath: 'Frameworks/React.md',
        matchedTerms: ['React Hooks'],
        summary: 'Covers hooks.',
        updatedAt: 1700000000000
      }
    ])

    expect(output).toBe('Memory Term: React Hooks\n\n1. **React**\nPath: Frameworks/React.md\nMatched: React Hooks\nSummary: Covers hooks.\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty memory term note results explicitly', () => {
    expect(formatNotesByMemoryTermToolResult('Missing', [])).toBe('No notes found for memory term "Missing".')
  })
})

describe('formatMemoryOverviewToolResult', () => {
  it('formats memory coverage and term counters', () => {
    const output = formatMemoryOverviewToolResult({
      notes: 10,
      memories: 7,
      current: 5,
      stale: 2,
      missing: 3,
      orphanMemories: 1,
      concepts: 12,
      topics: 4
    })

    expect(output).toBe('Memory Overview\nNotes: 10\nMemories: 7 (70%)\nCurrent: 5\nStale: 2\nMissing: 3\nOrphan Memories: 1\nConcepts: 12\nTopics: 4')
  })
})

describe('formatMemoryFoldersToolResult', () => {
  it('formats memory coverage by folder', () => {
    const output = formatMemoryFoldersToolResult([
      { path: 'Projects', notes: 4, current: 2, stale: 1, missing: 1 },
      { path: '_root', notes: 2, current: 2, stale: 0, missing: 0 }
    ])

    expect(output).toBe('1. Projects (75%)\nNotes: 4\nCurrent: 2\nStale: 1\nMissing: 1\n\n2. _root (100%)\nNotes: 2\nCurrent: 2\nStale: 0\nMissing: 0')
  })

  it('marks empty memory folder results explicitly', () => {
    expect(formatMemoryFoldersToolResult([])).toBe('No memory folders found.')
  })
})

describe('formatMemoryTermPairsToolResult', () => {
  it('formats memory term co-occurrence pairs with examples', () => {
    const output = formatMemoryTermPairsToolResult([
      { first: 'React Hooks', second: 'State Management', type: 'concept', count: 3, samplePaths: ['A.md', 'B.md'] },
      { first: 'React Hooks', second: 'Frontend Frameworks', type: 'mixed', count: 2, samplePaths: ['C.md'] }
    ])

    expect(output).toBe('1. React Hooks + State Management (concept, 3)\nExamples: A.md, B.md\n\n2. React Hooks + Frontend Frameworks (mixed, 2)\nExamples: C.md')
  })

  it('marks empty memory term pair results explicitly', () => {
    expect(formatMemoryTermPairsToolResult([])).toBe('No memory term pairs found.')
  })
})

describe('formatVaultOverviewToolResult', () => {
  it('formats vault health counters', () => {
    const output = formatVaultOverviewToolResult({
      notes: 12,
      tags: 4,
      properties: 6,
      tasksOpen: 3,
      tasksDone: 2,
      resolvedLinks: 20,
      unresolvedLinks: 1,
      orphanNotes: 5
    })

    expect(output).toBe('Vault Overview\nNotes: 12\nTags: 4\nProperties: 6\nTasks: 3 open, 2 done\nResolved Links: 20\nUnresolved Links: 1\nOrphan Notes: 5')
  })
})

describe('folder tool formatting', () => {
  it('formats folders with note counts', () => {
    const output = formatListFoldersToolResult([
      { path: 'Projects', count: 3 },
      { path: 'Daily/2026', count: 2 }
    ])

    expect(output).toBe('1. Projects (3)\n2. Daily/2026 (2)')
  })

  it('formats notes by folder with paths and timestamps', () => {
    const output = formatNotesByFolderToolResult('Projects', [
      { title: 'Alpha', filePath: 'Projects/Alpha.md', updatedAt: 1700000000000 }
    ])

    expect(output).toBe('Folder: Projects\n\n1. **Alpha**\nPath: Projects/Alpha.md\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty folder results explicitly', () => {
    expect(formatListFoldersToolResult([])).toBe('No folders found.')
    expect(formatNotesByFolderToolResult('Missing', [])).toBe('No notes found in folder Missing.')
  })
})

describe('formatDuplicateNoteTitlesToolResult', () => {
  it('formats duplicate title groups with paths', () => {
    const output = formatDuplicateNoteTitlesToolResult([
      { title: 'Topic', filePaths: ['A/Topic.md', 'B/Topic.md'] },
      { title: 'Project', filePaths: ['Project.md', 'Archive/Project.md', 'Old/Project.md'] }
    ])

    expect(output).toBe('1. **Topic** (2)\n- A/Topic.md\n- B/Topic.md\n\n2. **Project** (3)\n- Project.md\n- Archive/Project.md\n- Old/Project.md')
  })

  it('marks empty duplicate title results explicitly', () => {
    expect(formatDuplicateNoteTitlesToolResult([])).toBe('No duplicate note titles found.')
  })
})

describe('formatDuplicateAliasesToolResult', () => {
  it('formats duplicate aliases with note titles and paths', () => {
    const output = formatDuplicateAliasesToolResult([
      {
        alias: 'Project',
        notes: [
          { title: 'Alpha', filePath: 'Projects/Alpha.md' },
          { title: 'Beta', filePath: 'Projects/Beta.md' }
        ]
      }
    ])

    expect(output).toBe('1. **Project** (2)\n- Alpha: Projects/Alpha.md\n- Beta: Projects/Beta.md')
  })

  it('marks empty duplicate aliases explicitly', () => {
    expect(formatDuplicateAliasesToolResult([])).toBe('No duplicate aliases found.')
  })
})

describe('formatUntaggedNotesToolResult', () => {
  it('formats untagged notes with paths and timestamps', () => {
    const output = formatUntaggedNotesToolResult([
      { title: 'Inbox', filePath: 'Inbox.md', updatedAt: 1700000000000 }
    ])

    expect(output).toBe('1. **Inbox**\nPath: Inbox.md\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty untagged note results explicitly', () => {
    expect(formatUntaggedNotesToolResult([])).toBe('No untagged notes found.')
  })
})

describe('formatEmptyNotesToolResult', () => {
  it('formats empty notes with paths and timestamps', () => {
    const output = formatEmptyNotesToolResult([
      { title: 'Stub', filePath: 'Stub.md', updatedAt: 1700000000000 }
    ])

    expect(output).toBe('1. **Stub**\nPath: Stub.md\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty empty-note results explicitly', () => {
    expect(formatEmptyNotesToolResult([])).toBe('No empty notes found.')
  })
})

describe('formatLargeNotesToolResult', () => {
  it('formats large notes with paths, character counts, and timestamps', () => {
    const output = formatLargeNotesToolResult([
      { title: 'Research', filePath: 'Notes/Research.md', characters: 12000, updatedAt: 1700000000000 }
    ])

    expect(output).toBe('1. **Research**\nPath: Notes/Research.md\nCharacters: 12000\nUpdated: 2023-11-14T22:13:20.000Z')
  })

  it('marks empty large-note results explicitly', () => {
    expect(formatLargeNotesToolResult([])).toBe('No large notes found.')
  })
})
