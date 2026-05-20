export interface MarkdownFootnote {
  id: string
  number: number
  text: string
  htmlId: string
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
    text: definitions.get(id) || '',
    htmlId: getFootnoteHtmlId(id, index + 1)
  }))
}

export function stripMarkdownFootnoteDefinitions(markdown: string): string {
  return collectFootnoteDefinitions(markdown).body
}

export function renderMarkdownFootnotes(markdown: string): string {
  const body = stripMarkdownFootnoteDefinitions(markdown)
  const footnotes = parseMarkdownFootnotes(markdown)
  if (footnotes.length === 0) return body

  const byId = new Map(footnotes.map((footnote) => [footnote.id, footnote]))
  const bodyWithRefs = body.replace(/\[\^([^\]\s]+)\]/g, (match, rawId: string) => {
    const footnote = byId.get(rawId.trim())
    if (!footnote) return match
    return `<sup id="fnref-${footnote.htmlId}" class="footnote-ref"><a href="#fn-${footnote.htmlId}" aria-label="Footnote ${footnote.number}">${footnote.number}</a></sup>`
  })

  const items = footnotes.map((footnote) => {
    const text = escapeHtml(footnote.text).replace(/\n/g, '<br>')
    return `<li id="fn-${footnote.htmlId}">${text} <a href="#fnref-${footnote.htmlId}" class="footnote-backref" aria-label="Back to reference">back</a></li>`
  }).join('\n')

  return `${bodyWithRefs.trimEnd()}\n\n<section class="footnotes">\n<hr>\n<ol>\n${items}\n</ol>\n</section>`
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

function getFootnoteHtmlId(id: string, number: number): string {
  const slug = id
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `${number}-${slug || 'note'}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return entities[char]
  })
}
