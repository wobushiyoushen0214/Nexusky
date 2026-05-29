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

  const sourceLines = splitLineUnits(previousBody)
  const preferredEol = inferLineEnding(previousBody) || inferLineEnding(nextSerializedBody) || '\n'
  let sourceIndex = 0
  const output: string[] = []

  for (const change of diffLines(previousSerializedBody, nextSerializedBody)) {
    const changeLines = splitLineUnits(change.value)
    for (const line of changeLines) {
      if (change.added) {
        output.push(normalizeLineEnding(line.raw, preferredEol))
        continue
      }

      const matchIndex = findNextLine(sourceLines, sourceIndex, line)
      if (matchIndex < 0) continue

      output.push(...sourceLines.slice(sourceIndex, matchIndex).map((sourceLine) => sourceLine.raw))
      if (!change.removed) output.push(sourceLines[matchIndex].raw)
      sourceIndex = matchIndex + 1
    }
  }

  output.push(...sourceLines.slice(sourceIndex).map((line) => line.raw))
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
    if (sourceLines[index].text === target.text) return index
  }
  return -1
}
