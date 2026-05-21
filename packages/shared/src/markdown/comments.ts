export function stripMarkdownComments(markdown: string): string {
  const lines = markdown.split(/(\r\n|\n|\r)/)
  const output: string[] = []
  let inFence = false
  let inComment = false

  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index] || ''
    const ending = lines[index + 1] || ''
    const trimmed = line.trim()

    if (!inComment && (trimmed.startsWith('```') || trimmed.startsWith('~~~'))) {
      inFence = !inFence
      output.push(line, ending)
      continue
    }

    if (inFence) {
      output.push(line, ending)
      continue
    }

    const stripped = stripLineComments(line, inComment)
    inComment = stripped.inComment
    if (stripped.line || !inComment) output.push(stripped.line, ending)
  }

  return output.join('')
}

function stripLineComments(line: string, initialInComment: boolean): { line: string; inComment: boolean } {
  let cursor = 0
  let output = ''
  let inComment = initialInComment

  while (cursor < line.length) {
    if (inComment) {
      const end = line.indexOf('%%', cursor)
      if (end < 0) return { line: output, inComment: true }
      cursor = end + 2
      inComment = false
      continue
    }

    const commentStart = line.indexOf('%%', cursor)
    if (commentStart < 0) {
      output += line.slice(cursor)
      break
    }

    const codeStart = line.indexOf('`', cursor)
    if (codeStart >= 0 && codeStart < commentStart) {
      output += line.slice(cursor, codeStart)
      const marker = line.slice(codeStart).match(/^`+/)?.[0] || '`'
      const codeEnd = line.indexOf(marker, codeStart + marker.length)
      if (codeEnd < 0) {
        output += line.slice(codeStart)
        break
      }
      output += line.slice(codeStart, codeEnd + marker.length)
      cursor = codeEnd + marker.length
      continue
    }

    output += line.slice(cursor, commentStart)
    cursor = commentStart + 2
    inComment = true
  }

  return { line: output, inComment }
}
