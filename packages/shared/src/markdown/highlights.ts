export function renderMarkdownHighlights(markdown: string): string {
  const lines = markdown.split(/(\r\n|\n|\r)/)
  const output: string[] = []
  let inFence = false

  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index] || ''
    const ending = lines[index + 1] || ''
    const trimmed = line.trim()

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      output.push(line, ending)
      continue
    }

    output.push(inFence ? line : renderLineHighlights(line), ending)
  }

  return output.join('')
}

function renderLineHighlights(line: string): string {
  return line.split(/(`+[^`]*`+)/g).map((segment) => {
    if (segment.startsWith('`')) return segment
    return renderTextHighlights(segment)
  }).join('')
}

function renderTextHighlights(text: string): string {
  let cursor = 0
  let output = ''

  while (cursor < text.length) {
    const start = text.indexOf('==', cursor)
    if (start < 0) {
      output += text.slice(cursor)
      break
    }

    const end = text.indexOf('==', start + 2)
    if (end < 0) {
      output += text.slice(cursor)
      break
    }

    const content = text.slice(start + 2, end)
    if (!content.trim()) {
      output += text.slice(cursor, end + 2)
    } else {
      output += `${text.slice(cursor, start)}<mark>${escapeHtml(content)}</mark>`
    }
    cursor = end + 2
  }

  return output
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
