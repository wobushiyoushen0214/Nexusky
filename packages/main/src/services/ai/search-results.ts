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

  return [
    `Title: ${summary.title}`,
    `Path: ${summary.filePath}`,
    '',
    'Outgoing:',
    outgoing,
    '',
    'Backlinks:',
    backlinks
  ].join('\n')
}

function formatLinkContext(context: string): string {
  const trimmed = context.trim()
  return trimmed ? ` - ${trimmed.slice(0, 120)}` : ''
}
