export interface MarkdownFootnote {
  id: string
  number: number
  text: string
}

interface FootnoteDefinition {
  id: string
  text: string
}

export function parseMarkdownFootnotes(markdown: string): MarkdownFootnote[] {
  const { body, definitions } = collectFootnoteDefinitions(markdown)
  if (definitions.size === 0) return []

  const orderedIds: string[] = []
  const referencePattern = /\[\^([^\]\s]+)\]/g
  let match: RegExpExecArray | null
  while ((match = referencePattern.exec(body)) !== null) {
    const id = match[1].trim()
    if (!definitions.has(id) || orderedIds.includes(id)) continue
    orderedIds.push(id)
  }

  return orderedIds.map((id, index) => ({
    id,
    number: index + 1,
    text: definitions.get(id) || ''
  }))
}

export function stripMarkdownFootnoteDefinitions(markdown: string): string {
  return collectFootnoteDefinitions(markdown).body
}

function collectFootnoteDefinitions(markdown: string): { body: string; definitions: Map<string, FootnoteDefinition['text']> } {
  const lines = markdown.split(/(\r\n|\n|\r)/)
  const output: string[] = []
  const definitions = new Map<string, string>()
  let activeId: string | null = null

  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index] || ''
    const ending = lines[index + 1] || ''
    const definition = line.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/)

    if (definition) {
      activeId = definition[1].trim()
      definitions.set(activeId, definition[2].trim())
      continue
    }

    if (activeId && /^(?: {2,}|\t)\S/.test(line)) {
      const previous = definitions.get(activeId) || ''
      definitions.set(activeId, `${previous}${previous ? '\n' : ''}${line.trim()}`)
      continue
    }

    activeId = null
    output.push(line, ending)
  }

  return { body: output.join(''), definitions }
}
