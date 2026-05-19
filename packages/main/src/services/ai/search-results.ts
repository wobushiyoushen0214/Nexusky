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
    context: string
    resolved: boolean
  }[]
  backlinks: {
    sourceTitle: string
    sourcePath: string
    context: string
  }[]
  unlinkedMentions?: {
    sourceTitle: string
    sourcePath: string
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

export interface AiLinkHubResult {
  title: string
  filePath: string
  backlinks: number
  outgoing: number
  total: number
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

export function formatNoteLinksToolResult(summary: AiNoteLinksSummary): string {
  const outgoing = summary.outgoing.length > 0
    ? summary.outgoing.map((link, index) => {
      const target = link.targetPath ? `${link.targetTitle} (${link.targetPath})` : `${link.targetTitle} (unresolved)`
      return `${index + 1}. ${target}${formatLinkContext(link.context)}`
    }).join('\n')
    : '(none)'

  const backlinks = summary.backlinks.length > 0
    ? summary.backlinks.map((link, index) => (
      `${index + 1}. ${link.sourceTitle} (${link.sourcePath})${formatLinkContext(link.context)}`
    )).join('\n')
    : '(none)'
  const unlinkedMentions = summary.unlinkedMentions && summary.unlinkedMentions.length > 0
    ? summary.unlinkedMentions.map((mention, index) => (
      `${index + 1}. ${mention.sourceTitle} (${mention.sourcePath}) - "${mention.mention}"${formatLinkContext(mention.context)}`
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
