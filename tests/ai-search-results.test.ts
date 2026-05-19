import { describe, expect, it } from 'vitest'
import { formatDeadEndNotesToolResult, formatDuplicateAliasesToolResult, formatDuplicateNoteTitlesToolResult, formatEmptyNotesToolResult, formatLargeNotesToolResult, formatLinkHubsToolResult, formatListFoldersToolResult, formatListPropertiesToolResult, formatListTagsToolResult, formatListTasksToolResult, formatMissingPropertyNotesToolResult, formatNoteBlocksToolResult, formatNoteHeadingsToolResult, formatNoteLinksToolResult, formatNotesByFolderToolResult, formatNotesByPropertyToolResult, formatNotesByTagToolResult, formatOrphanNotesToolResult, formatPropertyValue, formatPropertyValuesToolResult, formatReadNoteToolResult, formatRecentNotesToolResult, formatSearchNotesToolResult, formatUntaggedNotesToolResult, formatUnreferencedNotesToolResult, formatUnresolvedLinksToolResult, formatVaultOverviewToolResult } from '../packages/main/src/services/ai/search-results'

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

describe('formatNoteLinksToolResult', () => {
  it('formats outgoing links and backlinks with paths', () => {
    const output = formatNoteLinksToolResult({
      title: 'Topic',
      filePath: 'Topic.md',
      outgoing: [
        { targetTitle: 'Next', targetPath: 'Folder/Next.md', context: 'See [[Next]] for details.', resolved: true },
        { targetTitle: 'Missing', context: 'See [[Missing]].', resolved: false }
      ],
      backlinks: [
        { sourceTitle: 'Source', sourcePath: 'Source.md', context: 'References [[Topic]].' }
      ],
      unlinkedMentions: [
        { sourceTitle: 'Loose', sourcePath: 'Loose.md', context: 'Topic appears without a link.', mention: 'Topic' }
      ]
    })

    expect(output).toContain('Title: Topic')
    expect(output).toContain('Path: Topic.md')
    expect(output).toContain('1. Next (Folder/Next.md) - See [[Next]] for details.')
    expect(output).toContain('2. Missing (unresolved) - See [[Missing]].')
    expect(output).toContain('1. Source (Source.md) - References [[Topic]].')
    expect(output).toContain('1. Loose (Loose.md) - "Topic" - Topic appears without a link.')
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
