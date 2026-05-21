export interface AiSearchResult {
  title: string
  filePath: string
  chunk: string
  score?: number
}

export interface AiNoteLinksSummary {
  title: string
  filePath: string
  outgoing: {
    targetTitle: string
    targetPath?: string
    line: number
    context: string
    resolved: boolean
  }[]
  backlinks: {
    sourceTitle: string
    sourcePath: string
    line: number
    context: string
  }[]
  unlinkedMentions?: {
    sourceTitle: string
    sourcePath: string
    line: number
    context: string
    mention: string
  }[]
}

export interface AiCurrentNoteLinkStatsResult {
  title: string
  filePath: string
  outgoing: number
  resolvedOutgoing: number
  unresolvedOutgoing: number
  backlinks: number
  unlinkedMentions: number
}

export interface AiCurrentNoteUnlinkedReferenceResult {
  title: string
  filePath: string
  references: {
    targetTitle: string
    targetPath: string
    line: number
    context: string
    mention: string
  }[]
}

export interface AiNoteHeadingSummary {
  title: string
  filePath: string
  headings: {
    level: number
    text: string
    line: number
  }[]
}

export interface AiNoteBlockSummary {
  title: string
  filePath: string
  blocks: {
    id: string
    line: number
    preview: string
  }[]
}

export interface AiNoteTextMatchSummary {
  title: string
  filePath: string
  query: string
  matches: {
    line: number
    context: string
  }[]
}

export interface AiTaskResult {
  text: string
  done: boolean
  noteTitle: string
  filePath: string
}

export interface AiTagResult {
  name: string
  count: number
}

export interface AiTaggedNoteResult {
  title: string
  filePath: string
}

export interface AiPropertySummary {
  key: string
  count: number
  sampleValues: string[]
}

export interface AiPropertyNoteResult {
  title: string
  filePath: string
  value: string
}

export interface AiPropertyValueSummary {
  value: string
  count: number
  samplePaths: string[]
}

export interface AiMissingPropertyNoteResult {
  title: string
  filePath: string
  updatedAt: number
}

export interface AiCurrentNotePropertyResult {
  title: string
  filePath: string
  properties: { key: string; value: string }[]
}

export interface AiRecentNoteResult {
  title: string
  filePath: string
  updatedAt: number
}

export interface AiUnresolvedLinkResult {
  sourceTitle: string
  sourcePath: string
  targetTitle: string
  context: string
}

export interface AiOrphanNoteResult {
  title: string
  filePath: string
  updatedAt: number
}

export interface AiUnreferencedNoteResult {
  title: string
  filePath: string
  updatedAt: number
}

export interface AiDeadEndNoteResult {
  title: string
  filePath: string
  updatedAt: number
}

export interface AiLinkHubResult {
  title: string
  filePath: string
  backlinks: number
  outgoing: number
  total: number
}

export interface AiKnowledgeBridgeResult {
  title: string
  filePath: string
  score: number
  connections: number
  folders: string[]
  tags: string[]
}

export interface AiSimilarNotePairResult {
  sourceTitle: string
  sourcePath: string
  targetTitle: string
  targetPath: string
  score: number
}

export interface AiMemoryRelatedNotePairResult {
  sourceTitle: string
  sourcePath: string
  targetTitle: string
  targetPath: string
  score: number
  reason: string
}

export interface AiConnectionOpportunityResult {
  sourceTitle: string
  sourcePath: string
  targetTitle: string
  targetPath: string
  suggestedSourceTitle?: string
  suggestedSourcePath?: string
  suggestedTargetTitle?: string
  suggestedTargetPath?: string
  suggestedWikilink?: string
  score: number
  reasons: string[]
}

export interface AiNoteMemoryResult {
  title: string
  filePath: string
  folder: string
  concepts: string[]
  topics: string[]
  summary: string
  updatedAt: number
}

export interface AiReadNoteMemoryResult extends AiNoteMemoryResult {
  status: 'current' | 'stale'
}

export interface AiMissingMemoryNoteResult {
  title: string
  filePath: string
  updatedAt: number
  reason: 'missing' | 'stale'
}

export interface AiMemoryTermSummary {
  term: string
  type: 'concept' | 'topic'
  count: number
  samplePaths: string[]
}

export interface AiMemoryTermNoteResult {
  title: string
  filePath: string
  matchedTerms: string[]
  summary: string
  updatedAt: number
}

export interface AiMemoryOverview {
  notes: number
  memories: number
  current: number
  stale: number
  missing: number
  orphanMemories: number
  concepts: number
  topics: number
}

export interface AiMemoryFolderSummary {
  path: string
  notes: number
  current: number
  stale: number
  missing: number
}

export interface AiMemoryTermPairSummary {
  first: string
  second: string
  type: 'concept' | 'topic' | 'mixed'
  count: number
  samplePaths: string[]
}

export interface AiVaultOverview {
  notes: number
  tags: number
  properties: number
  tasksOpen: number
  tasksDone: number
  resolvedLinks: number
  unresolvedLinks: number
  orphanNotes: number
}

export interface AiFolderSummary {
  path: string
  count: number
}

export interface AiFolderNoteResult {
  title: string
  filePath: string
  updatedAt: number
}

export interface AiDuplicateNoteTitleResult {
  title: string
  filePaths: string[]
}

export interface AiDuplicateAliasResult {
  alias: string
  notes: {
    title: string
    filePath: string
  }[]
}

export interface AiUntaggedNoteResult {
  title: string
  filePath: string
  updatedAt: number
}

export interface AiEmptyNoteResult {
  title: string
  filePath: string
  updatedAt: number
}

export interface AiLargeNoteResult {
  title: string
  filePath: string
  updatedAt: number
  characters: number
}

export function formatSearchNotesToolResult(results: AiSearchResult[]): string {
  return results.map((result, index) => [
    `${index + 1}. **${result.title}**`,
    `Path: ${result.filePath}`,
    result.chunk.slice(0, 200)
  ].join('\n')).join('\n\n')
}

export function formatReadNoteToolResult(note: { title: string; filePath: string; content: string; section?: string; blockId?: string }): string {
  const body = note.content.trim() || '(empty note)'
  const header = [
    `Title: ${note.title}`,
    `Path: ${note.filePath}`
  ]
  if (note.section) header.push(`Section: ${note.section}`)
  if (note.blockId) header.push(`Block: ^${note.blockId}`)

  return [
    ...header,
    '',
    body
  ].join('\n')
}

export function formatReadNoteLinesToolResult(note: { title: string; filePath: string; content: string; startLine: number; endLine: number }): string {
  const body = note.content.trim() || '(empty range)'
  return [
    `Title: ${note.title}`,
    `Path: ${note.filePath}`,
    `Lines: ${note.startLine}-${note.endLine}`,
    '',
    body
  ].join('\n')
}

export function formatNoteLinksToolResult(summary: AiNoteLinksSummary): string {
  const outgoing = summary.outgoing.length > 0
    ? summary.outgoing.map((link, index) => {
      const target = link.targetPath ? `${link.targetTitle} (${link.targetPath}:${link.line})` : `${link.targetTitle} (unresolved:${link.line})`
      return `${index + 1}. ${target}${formatLinkContext(link.context)}`
    }).join('\n')
    : '(none)'

  const backlinks = summary.backlinks.length > 0
    ? summary.backlinks.map((link, index) => (
      `${index + 1}. ${link.sourceTitle} (${link.sourcePath}:${link.line})${formatLinkContext(link.context)}`
    )).join('\n')
    : '(none)'
  const unlinkedMentions = summary.unlinkedMentions && summary.unlinkedMentions.length > 0
    ? summary.unlinkedMentions.map((mention, index) => (
      `${index + 1}. ${mention.sourceTitle} (${mention.sourcePath}:${mention.line}) - "${mention.mention}"${formatLinkContext(mention.context)}`
    )).join('\n')
    : '(none)'

  return [
    `Title: ${summary.title}`,
    `Path: ${summary.filePath}`,
    '',
    'Outgoing:',
    outgoing,
    '',
    'Backlinks:',
    backlinks,
    '',
    'Unlinked Mentions:',
    unlinkedMentions
  ].join('\n')
}

export function formatCurrentNoteLinkStatsToolResult(stats: AiCurrentNoteLinkStatsResult): string {
  const signals: string[] = []
  if (stats.resolvedOutgoing === 0 && stats.backlinks === 0) signals.push('orphan')
  if (stats.resolvedOutgoing === 0) signals.push('dead-end')
  if (stats.backlinks === 0) signals.push('unreferenced')
  if (stats.unresolvedOutgoing > 0) signals.push('has unresolved links')
  if (stats.unlinkedMentions > 0) signals.push('has unlinked mentions')
  return [
    `Current Note Link Summary: ${stats.title}`,
    `Path: ${stats.filePath}`,
    `Outgoing: ${stats.outgoing} (${stats.resolvedOutgoing} resolved, ${stats.unresolvedOutgoing} unresolved)`,
    `Backlinks: ${stats.backlinks}`,
    `Unlinked Mentions: ${stats.unlinkedMentions}`,
    `Signals: ${signals.length > 0 ? signals.join(', ') : 'connected'}`
  ].join('\n')
}

export function formatCurrentNoteUnlinkedReferencesToolResult(summary: AiCurrentNoteUnlinkedReferenceResult): string {
  if (summary.references.length === 0) return `No unlinked note references found in ${summary.title} (${summary.filePath}).`
  const body = summary.references.map((reference, index) => (
    `${index + 1}. ${reference.targetTitle} (${reference.targetPath}:${reference.line}) - "${reference.mention}"${formatLinkContext(reference.context)}`
  )).join('\n')
  return [
    `Current Note Unlinked References: ${summary.title}`,
    `Path: ${summary.filePath}`,
    '',
    body
  ].join('\n')
}

export function formatNoteHeadingsToolResult(summary: AiNoteHeadingSummary): string {
  if (summary.headings.length === 0) return `No headings found for ${summary.title} (${summary.filePath}).`
  const headings = summary.headings.map((heading, index) => (
    `${index + 1}. ${'#'.repeat(heading.level)} ${heading.text} (line ${heading.line})`
  )).join('\n')
  return [
    `Title: ${summary.title}`,
    `Path: ${summary.filePath}`,
    '',
    'Headings:',
    headings
  ].join('\n')
}

export function formatNoteBlocksToolResult(summary: AiNoteBlockSummary): string {
  if (summary.blocks.length === 0) return `No block references found for ${summary.title} (${summary.filePath}).`
  const blocks = summary.blocks.map((block, index) => (
    `${index + 1}. ^${block.id} (line ${block.line})${formatLinkContext(block.preview)}`
  )).join('\n')
  return [
    `Title: ${summary.title}`,
    `Path: ${summary.filePath}`,
    '',
    'Blocks:',
    blocks
  ].join('\n')
}

export function formatFindTextInNoteToolResult(summary: AiNoteTextMatchSummary): string {
  if (summary.matches.length === 0) return `No matches found for "${summary.query}" in ${summary.title} (${summary.filePath}).`
  const matches = summary.matches.map((match, index) => (
    `${index + 1}. Line ${match.line}${formatLinkContext(match.context)}`
  )).join('\n')
  return [
    `Title: ${summary.title}`,
    `Path: ${summary.filePath}`,
    `Query: ${summary.query}`,
    '',
    'Matches:',
    matches
  ].join('\n')
}

export function formatListTasksToolResult(tasks: AiTaskResult[]): string {
  if (tasks.length === 0) return 'No tasks found.'
  return tasks.map((task, index) => [
    `${index + 1}. ${task.done ? '[x]' : '[ ]'} ${task.text}`,
    `Note: ${task.noteTitle}`,
    `Path: ${task.filePath}`
  ].join('\n')).join('\n\n')
}

export function formatListTagsToolResult(tags: AiTagResult[]): string {
  if (tags.length === 0) return 'No tags found.'
  return tags.map((tag, index) => `${index + 1}. #${tag.name} (${tag.count})`).join('\n')
}

export function formatNotesByTagToolResult(tag: string, notes: AiTaggedNoteResult[]): string {
  if (notes.length === 0) return `No notes found for #${tag}.`
  const body = notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`
  ].join('\n')).join('\n\n')
  return `Tag: #${tag}\n\n${body}`
}

export function formatListPropertiesToolResult(properties: AiPropertySummary[]): string {
  if (properties.length === 0) return 'No properties found.'
  return properties.map((property, index) => {
    const samples = property.sampleValues.length > 0 ? ` - examples: ${property.sampleValues.join(', ')}` : ''
    return `${index + 1}. ${property.key} (${property.count})${samples}`
  }).join('\n')
}

export function formatNotesByPropertyToolResult(key: string, notes: AiPropertyNoteResult[], value?: string): string {
  if (notes.length === 0) return value ? `No notes found for ${key} matching "${value}".` : `No notes found with property ${key}.`
  const header = value ? `Property: ${key} ~= "${value}"` : `Property: ${key}`
  const body = notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Value: ${note.value}`
  ].join('\n')).join('\n\n')
  return `${header}\n\n${body}`
}

export function formatPropertyValuesToolResult(key: string, values: AiPropertyValueSummary[]): string {
  if (values.length === 0) return `No values found for property ${key}.`
  const body = values.map((item, index) => [
    `${index + 1}. ${item.value} (${item.count})`,
    `Examples: ${item.samplePaths.join(', ')}`
  ].join('\n')).join('\n\n')
  return `Property Values: ${key}\n\n${body}`
}

export function formatMissingPropertyNotesToolResult(key: string, notes: AiMissingPropertyNoteResult[]): string {
  if (notes.length === 0) return `No notes missing property ${key}.`
  const body = notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
  return `Missing Property: ${key}\n\n${body}`
}

export function formatCurrentNotePropertiesToolResult(note: AiCurrentNotePropertyResult): string {
  if (note.properties.length === 0) return `No properties found for ${note.title} (${note.filePath}).`
  const body = note.properties.map((property, index) => `${index + 1}. ${property.key}: ${property.value}`).join('\n')
  return [
    `Current Note Properties: ${note.title}`,
    `Path: ${note.filePath}`,
    '',
    body
  ].join('\n')
}

export function formatPropertyValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatPropertyValue).join(', ')
  if (value === null || value === undefined) return ''
  return String(value)
}

export function formatRecentNotesToolResult(notes: AiRecentNoteResult[]): string {
  if (notes.length === 0) return 'No recent notes found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
}

export function formatUnresolvedLinksToolResult(links: AiUnresolvedLinkResult[]): string {
  if (links.length === 0) return 'No unresolved links found.'
  return links.map((link, index) => [
    `${index + 1}. [[${link.targetTitle}]]`,
    `Source: ${link.sourceTitle}`,
    `Path: ${link.sourcePath}`,
    `Context: ${link.context || '(none)'}`
  ].join('\n')).join('\n\n')
}

export function formatOrphanNotesToolResult(notes: AiOrphanNoteResult[]): string {
  if (notes.length === 0) return 'No orphan notes found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
}

export function formatUnreferencedNotesToolResult(notes: AiUnreferencedNoteResult[]): string {
  if (notes.length === 0) return 'No unreferenced notes found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
}

export function formatDeadEndNotesToolResult(notes: AiDeadEndNoteResult[]): string {
  if (notes.length === 0) return 'No dead-end notes found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
}

export function formatLinkHubsToolResult(notes: AiLinkHubResult[]): string {
  if (notes.length === 0) return 'No link hubs found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Backlinks: ${note.backlinks}`,
    `Outgoing: ${note.outgoing}`,
    `Total: ${note.total}`
  ].join('\n')).join('\n\n')
}

export function formatKnowledgeBridgesToolResult(notes: AiKnowledgeBridgeResult[]): string {
  if (notes.length === 0) return 'No knowledge bridge notes found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Bridge Score: ${note.score}`,
    `Connections: ${note.connections}`,
    `Neighbor Folders: ${note.folders.length > 0 ? note.folders.join(', ') : '(none)'}`,
    `Neighbor Tags: ${note.tags.length > 0 ? note.tags.join(', ') : '(none)'}`,
    'Suggested action: maintain this note as a synthesis point across clusters.'
  ].join('\n')).join('\n\n')
}

export function formatSimilarNotesToolResult(pairs: AiSimilarNotePairResult[]): string {
  if (pairs.length === 0) return 'No similar notes found.'
  return pairs.map((pair, index) => [
    `${index + 1}. **${pair.sourceTitle}** -> **${pair.targetTitle}**`,
    `Source: ${pair.sourcePath}`,
    `Target: ${pair.targetPath}`,
    `Score: ${pair.score.toFixed(3)}`
  ].join('\n')).join('\n\n')
}

export function formatMemoryRelatedNotesToolResult(pairs: AiMemoryRelatedNotePairResult[]): string {
  if (pairs.length === 0) return 'No memory-related notes found.'
  return pairs.map((pair, index) => [
    `${index + 1}. **${pair.sourceTitle}** -> **${pair.targetTitle}**`,
    `Source: ${pair.sourcePath}`,
    `Target: ${pair.targetPath}`,
    `Reason: ${pair.reason || '(none)'}`,
    `Score: ${pair.score.toFixed(3)}`
  ].join('\n')).join('\n\n')
}

export function formatConnectionOpportunitiesToolResult(pairs: AiConnectionOpportunityResult[]): string {
  if (pairs.length === 0) return 'No connection opportunities found.'
  return pairs.map((pair, index) => {
    const lines = [
      `${index + 1}. **${pair.sourceTitle}** -> **${pair.targetTitle}**`,
      `Source: ${pair.sourcePath}`,
      `Target: ${pair.targetPath}`,
      `Reasons: ${pair.reasons.length > 0 ? pair.reasons.join('; ') : '(none)'}`,
      `Score: ${pair.score.toFixed(1)}`
    ]
    if (pair.suggestedSourcePath && pair.suggestedWikilink) {
      lines.push(`Suggested edit: add ${pair.suggestedWikilink} to ${pair.suggestedSourcePath}`)
    }
    return lines.join('\n')
  }).join('\n\n')
}

export function formatNoteMemoriesToolResult(memories: AiNoteMemoryResult[]): string {
  if (memories.length === 0) return 'No note memories found.'
  return memories.map((memory, index) => [
    `${index + 1}. **${memory.title}**`,
    `Path: ${memory.filePath}`,
    `Folder: ${memory.folder}`,
    `Concepts: ${memory.concepts.length > 0 ? memory.concepts.join(', ') : '(none)'}`,
    `Topics: ${memory.topics.length > 0 ? memory.topics.join(', ') : '(none)'}`,
    `Summary: ${memory.summary || '(none)'}`,
    `Updated: ${formatTimestamp(memory.updatedAt)}`
  ].join('\n')).join('\n\n')
}

export function formatReadNoteMemoryToolResult(memory: AiReadNoteMemoryResult): string {
  return [
    `Title: ${memory.title}`,
    `Path: ${memory.filePath}`,
    `Folder: ${memory.folder}`,
    `Status: ${memory.status}`,
    `Concepts: ${memory.concepts.length > 0 ? memory.concepts.join(', ') : '(none)'}`,
    `Topics: ${memory.topics.length > 0 ? memory.topics.join(', ') : '(none)'}`,
    `Summary: ${memory.summary || '(none)'}`,
    `Updated: ${formatTimestamp(memory.updatedAt)}`
  ].join('\n')
}

export function formatMissingMemoryNotesToolResult(notes: AiMissingMemoryNoteResult[]): string {
  if (notes.length === 0) return 'No missing or stale note memories found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Reason: ${note.reason}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
}

export function formatMemoryTermsToolResult(terms: AiMemoryTermSummary[]): string {
  if (terms.length === 0) return 'No memory terms found.'
  return terms.map((term, index) => [
    `${index + 1}. ${term.term} (${term.type}, ${term.count})`,
    `Examples: ${term.samplePaths.length > 0 ? term.samplePaths.join(', ') : '(none)'}`
  ].join('\n')).join('\n\n')
}

export function formatNotesByMemoryTermToolResult(term: string, notes: AiMemoryTermNoteResult[]): string {
  if (notes.length === 0) return `No notes found for memory term "${term}".`
  const body = notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Matched: ${note.matchedTerms.join(', ')}`,
    `Summary: ${note.summary || '(none)'}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
  return `Memory Term: ${term}\n\n${body}`
}

export function formatMemoryOverviewToolResult(overview: AiMemoryOverview): string {
  const coverage = overview.notes > 0 ? `${Math.round((overview.memories / overview.notes) * 100)}%` : '0%'
  return [
    'Memory Overview',
    `Notes: ${overview.notes}`,
    `Memories: ${overview.memories} (${coverage})`,
    `Current: ${overview.current}`,
    `Stale: ${overview.stale}`,
    `Missing: ${overview.missing}`,
    `Orphan Memories: ${overview.orphanMemories}`,
    `Concepts: ${overview.concepts}`,
    `Topics: ${overview.topics}`
  ].join('\n')
}

export function formatMemoryFoldersToolResult(folders: AiMemoryFolderSummary[]): string {
  if (folders.length === 0) return 'No memory folders found.'
  return folders.map((folder, index) => {
    const covered = folder.current + folder.stale
    const coverage = folder.notes > 0 ? `${Math.round((covered / folder.notes) * 100)}%` : '0%'
    return [
      `${index + 1}. ${folder.path} (${coverage})`,
      `Notes: ${folder.notes}`,
      `Current: ${folder.current}`,
      `Stale: ${folder.stale}`,
      `Missing: ${folder.missing}`
    ].join('\n')
  }).join('\n\n')
}

export function formatMemoryTermPairsToolResult(pairs: AiMemoryTermPairSummary[]): string {
  if (pairs.length === 0) return 'No memory term pairs found.'
  return pairs.map((pair, index) => [
    `${index + 1}. ${pair.first} + ${pair.second} (${pair.type}, ${pair.count})`,
    `Examples: ${pair.samplePaths.length > 0 ? pair.samplePaths.join(', ') : '(none)'}`
  ].join('\n')).join('\n\n')
}

export function formatVaultOverviewToolResult(overview: AiVaultOverview): string {
  return [
    'Vault Overview',
    `Notes: ${overview.notes}`,
    `Tags: ${overview.tags}`,
    `Properties: ${overview.properties}`,
    `Tasks: ${overview.tasksOpen} open, ${overview.tasksDone} done`,
    `Resolved Links: ${overview.resolvedLinks}`,
    `Unresolved Links: ${overview.unresolvedLinks}`,
    `Orphan Notes: ${overview.orphanNotes}`
  ].join('\n')
}

export function formatListFoldersToolResult(folders: AiFolderSummary[]): string {
  if (folders.length === 0) return 'No folders found.'
  return folders.map((folder, index) => `${index + 1}. ${folder.path} (${folder.count})`).join('\n')
}

export function formatNotesByFolderToolResult(folder: string, notes: AiFolderNoteResult[]): string {
  if (notes.length === 0) return `No notes found in folder ${folder}.`
  const body = notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
  return `Folder: ${folder}\n\n${body}`
}

export function formatDuplicateNoteTitlesToolResult(groups: AiDuplicateNoteTitleResult[]): string {
  if (groups.length === 0) return 'No duplicate note titles found.'
  return groups.map((group, index) => [
    `${index + 1}. **${group.title}** (${group.filePaths.length})`,
    ...group.filePaths.map((filePath) => `- ${filePath}`)
  ].join('\n')).join('\n\n')
}

export function formatDuplicateAliasesToolResult(groups: AiDuplicateAliasResult[]): string {
  if (groups.length === 0) return 'No duplicate aliases found.'
  return groups.map((group, index) => [
    `${index + 1}. **${group.alias}** (${group.notes.length})`,
    ...group.notes.map((note) => `- ${note.title}: ${note.filePath}`)
  ].join('\n')).join('\n\n')
}

export function formatUntaggedNotesToolResult(notes: AiUntaggedNoteResult[]): string {
  if (notes.length === 0) return 'No untagged notes found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
}

export function formatEmptyNotesToolResult(notes: AiEmptyNoteResult[]): string {
  if (notes.length === 0) return 'No empty notes found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
}

export function formatLargeNotesToolResult(notes: AiLargeNoteResult[]): string {
  if (notes.length === 0) return 'No large notes found.'
  return notes.map((note, index) => [
    `${index + 1}. **${note.title}**`,
    `Path: ${note.filePath}`,
    `Characters: ${note.characters}`,
    `Updated: ${formatTimestamp(note.updatedAt)}`
  ].join('\n')).join('\n\n')
}

function formatLinkContext(context: string): string {
  const trimmed = context.trim()
  return trimmed ? ` - ${trimmed.slice(0, 120)}` : ''
}

function formatTimestamp(value: number): string {
  return Number.isFinite(value) ? new Date(value).toISOString() : 'unknown'
}
