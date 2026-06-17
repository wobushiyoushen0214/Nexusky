import { diffLines } from 'diff'

type MarkdownFrontmatterSplit = {
  frontmatter: string
  body: string
}

type LineUnit = {
  raw: string
  text: string
  eol: string
}

// Match two lines by comparing trimmed text — the Markdown serializer may
// normalize trailing whitespace, so exact text comparison can silently drop lines
// and cause content to revert to a previous state after save.
function linesMatch(a: LineUnit, b: LineUnit): boolean {
  if (a.text === b.text) return true
  return a.text.trimEnd() === b.text.trimEnd()
}

export function splitMarkdownFrontmatter(content: string): MarkdownFrontmatterSplit {
  const match = content.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/)
  if (!match) return { frontmatter: '', body: content }
  return { frontmatter: match[1], body: content.slice(match[1].length) }
}

export function stripMarkdownFrontmatter(content: string): string {
  return splitMarkdownFrontmatter(content).body
}

export function mergeEditorMarkdownContent(
  previousContent: string,
  previousSerializedBody: string,
  nextSerializedBody: string
): string {
  const { frontmatter, body } = splitMarkdownFrontmatter(previousContent)
  return frontmatter + applySerializedMarkdownEdit(body, previousSerializedBody, nextSerializedBody)
}

export function applySerializedMarkdownEdit(
  previousBody: string,
  previousSerializedBody: string,
  nextSerializedBody: string
): string {
  if (previousSerializedBody === nextSerializedBody) return previousBody

  // Fast path: if the bodies match directly, use next serialized body directly.
  // This avoids diff-based merging when the roundtrip representation is consistent.
  if (previousBody === previousSerializedBody) return nextSerializedBody

  const sourceLines = splitLineUnits(previousBody)
  const preferredEol = inferLineEnding(previousBody) || inferLineEnding(nextSerializedBody) || '\n'
  let sourceIndex = 0
  const output: string[] = []
  // Track which source lines have been consumed to prevent duplicate matching
  const consumed = new Set<number>()

  for (const change of diffLines(previousSerializedBody, nextSerializedBody)) {
    const changeLines = splitLineUnits(change.value)
    for (const line of changeLines) {
      if (change.added) {
        output.push(normalizeLineEnding(line.raw, preferredEol))
        continue
      }

      // Find the FIRST unconsumed source line matching this text, starting from sourceIndex
      let matchIndex = -1
      for (let i = sourceIndex; i < sourceLines.length; i++) {
        if (!consumed.has(i) && linesMatch(sourceLines[i], line)) {
          matchIndex = i
          break
        }
      }
      if (matchIndex < 0) {
        // Try from the beginning in case the line was matched earlier than expected
        for (let i = 0; i < sourceIndex; i++) {
          if (!consumed.has(i) && linesMatch(sourceLines[i], line)) {
            matchIndex = i
            break
          }
        }
      }
      if (matchIndex < 0) {
        // If an equal (unchanged) line can't be matched in the source body,
        // the diff mapping is unreliable — fall back to avoid data corruption.
        if (!change.removed) return nextSerializedBody
        continue
      }

      // Output all lines between sourceIndex and matchIndex (these were skipped/removed)
      for (let i = sourceIndex; i < matchIndex; i++) {
        if (!consumed.has(i)) {
          output.push(sourceLines[i].raw)
          consumed.add(i)
        }
      }
      if (!change.removed) {
        output.push(sourceLines[matchIndex].raw)
        consumed.add(matchIndex)
      }
      sourceIndex = matchIndex + 1
    }
  }

  // Append any remaining unconsumed source lines
  for (let i = sourceIndex; i < sourceLines.length; i++) {
    if (!consumed.has(i)) output.push(sourceLines[i].raw)
  }

  return output.join('')
}

function splitLineUnits(text: string): LineUnit[] {
  const lines: LineUnit[] = []
  const regex = /([^\r\n]*)(\r\n|\n|\r|$)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match[0] === '') break
    lines.push({
      raw: match[0],
      text: match[1],
      eol: match[2]
    })
    if (match[2] === '') break
  }

  return lines
}

function inferLineEnding(text: string): string | null {
  const match = text.match(/\r\n|\n|\r/)
  return match ? match[0] : null
}

function normalizeLineEnding(line: string, preferredEol: string): string {
  return line.replace(/\r\n|\n|\r/g, preferredEol)
}

function findNextLine(sourceLines: LineUnit[], startIndex: number, target: LineUnit): number {
  for (let index = startIndex; index < sourceLines.length; index++) {
    if (linesMatch(sourceLines[index], target)) return index
  }
  return -1
}
