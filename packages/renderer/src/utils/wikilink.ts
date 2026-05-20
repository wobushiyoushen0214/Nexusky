export interface LinkPlainMentionResult {
  content: string
  changed: boolean
}

export interface PlainMentionTarget {
  line: number
  mention: string
}

export interface LinkPlainMentionsResult {
  content: string
  changedCount: number
}

export function linkPlainMentionAtLine(content: string, lineNumber: number, mention: string): LinkPlainMentionResult {
  const cleanMention = mention.replace(/[\[\]\r\n]/g, '').trim()
  if (!cleanMention || lineNumber < 1) return { content, changed: false }

  const line = getLineAtNumber(content, lineNumber)
  if (!line) return { content, changed: false }

  const mentionIndex = findPlainMentionInLine(line.body, cleanMention)
  if (mentionIndex < 0) return { content, changed: false }

  const linkedBody = `${line.body.slice(0, mentionIndex)}[[${line.body.slice(mentionIndex, mentionIndex + cleanMention.length)}]]${line.body.slice(mentionIndex + cleanMention.length)}`
  return {
    content: `${content.slice(0, line.start)}${linkedBody}${line.ending}${content.slice(line.end)}`,
    changed: true,
  }
}

export function linkPlainMentionsAtLines(content: string, targets: PlainMentionTarget[]): LinkPlainMentionsResult {
  let nextContent = content
  let changedCount = 0

  for (const target of targets) {
    const next = linkPlainMentionAtLine(nextContent, target.line, target.mention)
    if (!next.changed) continue
    nextContent = next.content
    changedCount++
  }

  return { content: nextContent, changedCount }
}

function getLineAtNumber(content: string, lineNumber: number): { start: number; end: number; body: string; ending: string } | null {
  let currentLine = 1
  let start = 0

  while (start <= content.length) {
    let bodyEnd = start
    while (bodyEnd < content.length && content[bodyEnd] !== '\n' && content[bodyEnd] !== '\r') bodyEnd++

    let end = bodyEnd
    let ending = ''
    if (content[end] === '\r' && content[end + 1] === '\n') {
      ending = '\r\n'
      end += 2
    } else if (content[end] === '\r' || content[end] === '\n') {
      ending = content[end]
      end += 1
    }

    if (currentLine === lineNumber) {
      return { start, end, body: content.slice(start, bodyEnd), ending }
    }

    if (end >= content.length) break
    currentLine++
    start = end
  }

  return null
}

function findPlainMentionInLine(line: string, mention: string): number {
  const lowerLine = line.toLowerCase()
  const lowerMention = mention.toLowerCase()
  let index = lowerLine.indexOf(lowerMention)

  while (index >= 0) {
    if (!isInsideWikilink(line, index) && hasPlainMentionBoundary(line, mention, index)) return index
    index = lowerLine.indexOf(lowerMention, index + lowerMention.length)
  }

  return -1
}

function isInsideWikilink(line: string, index: number): boolean {
  const open = line.lastIndexOf('[[', index)
  if (open < 0) return false
  const close = line.indexOf(']]', open + 2)
  return close >= index
}

function hasPlainMentionBoundary(line: string, mention: string, index: number): boolean {
  const isWordChar = (value: string) => /^[A-Za-z0-9_]$/.test(value)
  const before = index > 0 ? line[index - 1] : ''
  const after = index + mention.length < line.length ? line[index + mention.length] : ''
  if (isWordChar(mention[0]) && isWordChar(before)) return false
  if (isWordChar(mention[mention.length - 1]) && isWordChar(after)) return false
  return true
}
