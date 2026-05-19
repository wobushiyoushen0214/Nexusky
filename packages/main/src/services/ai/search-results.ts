export interface AiSearchResult {
  title: string
  filePath: string
  chunk: string
  score?: number
}

export function formatSearchNotesToolResult(results: AiSearchResult[]): string {
  return results.map((result, index) => [
    `${index + 1}. **${result.title}**`,
    `Path: ${result.filePath}`,
    result.chunk.slice(0, 200)
  ].join('\n')).join('\n\n')
}

export function formatReadNoteToolResult(note: { title: string; filePath: string; content: string }): string {
  const body = note.content.trim() || '(empty note)'
  return [
    `Title: ${note.title}`,
    `Path: ${note.filePath}`,
    '',
    body
  ].join('\n')
}
