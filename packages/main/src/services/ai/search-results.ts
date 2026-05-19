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

function formatLinkContext(context: string): string {
  const trimmed = context.trim()
  return trimmed ? ` - ${trimmed.slice(0, 120)}` : ''
}
