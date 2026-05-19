export interface NoteProperties {
  title: string
  aliases: string[]
  tags: string[]
  cssclasses: string[]
}

const EMPTY_PROPERTIES: NoteProperties = {
  title: '',
  aliases: [],
  tags: [],
  cssclasses: []
}

export function parseNoteProperties(markdown: string): NoteProperties {
  const block = extractFrontmatter(markdown)
  if (!block) return { ...EMPTY_PROPERTIES }

  const title = readScalar(block.raw, 'title')
  const aliases = readList(block.raw, 'aliases')
  const legacyAlias = readList(block.raw, 'alias')
  const tags = readList(block.raw, 'tags').map((tag) => tag.replace(/^#/, ''))
  const cssclasses = readList(block.raw, 'cssclasses')

  return {
    title,
    aliases: aliases.length > 0 ? aliases : legacyAlias,
    tags,
    cssclasses
  }
}

export function updateNoteProperties(markdown: string, next: NoteProperties): string {
  const block = extractFrontmatter(markdown)
  const body = block ? markdown.slice(block.end) : markdown
  let raw = block?.raw || ''

  raw = removeProperty(raw, 'alias')
  raw = writeProperty(raw, 'title', next.title.trim())
  raw = writeProperty(raw, 'aliases', normalizeList(next.aliases))
  raw = writeProperty(raw, 'tags', normalizeList(next.tags).map((tag) => tag.replace(/^#/, '')))
  raw = writeProperty(raw, 'cssclasses', normalizeList(next.cssclasses))

  const trimmedRaw = raw.trim()
  if (!trimmedRaw) return body.replace(/^\n+/, '')
  return `---\n${trimmedRaw}\n---\n${body.replace(/^\n+/, '')}`
}

export function updateFrontmatterProperty(markdown: string, key: string, value: string | string[]): string {
  const safeKey = key.trim()
  if (!safeKey || !/^[A-Za-z0-9_-]+$/.test(safeKey)) return markdown

  const block = extractFrontmatter(markdown)
  const body = block ? markdown.slice(block.end) : markdown
  let raw = block?.raw || ''
  raw = writeProperty(raw, safeKey, Array.isArray(value) ? normalizeList(value) : value.trim())

  const trimmedRaw = raw.trim()
  if (!trimmedRaw) return body.replace(/^\n+/, '')
  return `---\n${trimmedRaw}\n---\n${body.replace(/^\n+/, '')}`
}

function extractFrontmatter(markdown: string): { raw: string; end: number } | null {
  if (!markdown.startsWith('---\n') && markdown !== '---') return null
  const endMarker = markdown.indexOf('\n---', 4)
  if (endMarker < 0) return null
  const markerEnd = markdown.indexOf('\n', endMarker + 4)
  return {
    raw: markdown.slice(4, endMarker),
    end: markerEnd >= 0 ? markerEnd + 1 : markdown.length
  }
}

function readScalar(raw: string, key: string): string {
  const lines = raw.split('\n')
  const line = lines.find((item) => item.match(new RegExp(`^${escapeRegExp(key)}\\s*:`)))
  if (!line) return ''
  return unquote(line.replace(new RegExp(`^${escapeRegExp(key)}\\s*:`), '').trim())
}

function readList(raw: string, key: string): string[] {
  const lines = raw.split('\n')
  const start = lines.findIndex((line) => line.match(new RegExp(`^${escapeRegExp(key)}\\s*:`)))
  if (start < 0) return []

  const firstValue = lines[start].replace(new RegExp(`^${escapeRegExp(key)}\\s*:`), '').trim()
  if (firstValue) {
    if (firstValue.startsWith('[') && firstValue.endsWith(']')) {
      return firstValue.slice(1, -1).split(',').map((value) => unquote(value.trim())).filter(Boolean)
    }
    return firstValue.split(',').map((value) => unquote(value.trim())).filter(Boolean)
  }

  const values: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^[A-Za-z0-9_-]+\s*:/.test(line)) break
    const match = line.match(/^\s*-\s*(.+)$/)
    if (match) values.push(unquote(match[1].trim()))
  }
  return values
}

function writeProperty(raw: string, key: string, value: string | string[]): string {
  const nextBlock = Array.isArray(value)
    ? value.length > 0 ? [`${key}:`, ...value.map((item) => `  - ${quote(item)}`)] : []
    : value ? [`${key}: ${quote(value)}`] : []

  const lines = raw.split('\n').filter((line, index, arr) => !(line === '' && index === arr.length - 1))
  const range = findPropertyRange(lines, key)
  if (!range) {
    return [...lines, ...nextBlock].filter((line) => line.trim() !== '').join('\n')
  }
  lines.splice(range.start, range.end - range.start, ...nextBlock)
  return lines.filter((line, index, arr) => !(line.trim() === '' && (index === 0 || index === arr.length - 1))).join('\n')
}

function removeProperty(raw: string, key: string): string {
  const lines = raw.split('\n')
  const range = findPropertyRange(lines, key)
  if (!range) return raw
  lines.splice(range.start, range.end - range.start)
  return lines.join('\n')
}

function findPropertyRange(lines: string[], key: string): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line.match(new RegExp(`^${escapeRegExp(key)}\\s*:`)))
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && !/^[A-Za-z0-9_-]+\s*:/.test(lines[end])) end++
  return { start, end }
}

function normalizeList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
