export interface NoteProperties {
  title: string
  aliases: string[]
  tags: string[]
  cssclasses: string[]
}

type FrontmatterScalar = string | number | boolean
type FrontmatterValue = FrontmatterScalar | FrontmatterScalar[] | null

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
  const tags = readTags(block.raw)
  const cssclasses = readCssClasses(block.raw, 'cssclasses')
  const legacyCssclass = readCssClasses(block.raw, 'cssclass')

  return {
    title,
    aliases: aliases.length > 0 ? aliases : legacyAlias,
    tags,
    cssclasses: cssclasses.length > 0 ? cssclasses : legacyCssclass
  }
}

export function updateNoteProperties(markdown: string, next: NoteProperties): string {
  const block = extractFrontmatter(markdown)
  const body = block ? markdown.slice(block.end) : markdown
  let raw = block?.raw || ''

  raw = removeProperty(raw, 'alias')
  raw = removeProperty(raw, 'cssclass')
  raw = writeProperty(raw, 'title', next.title.trim())
  raw = writeProperty(raw, 'aliases', normalizeList(next.aliases))
  raw = writeProperty(raw, 'tags', normalizeList(next.tags).map((tag) => tag.replace(/^#/, '')))
  raw = writeProperty(raw, 'cssclasses', normalizeList(next.cssclasses))

  const trimmedRaw = raw.trim()
  if (!trimmedRaw) return body.replace(/^\n+/, '')
  return `---\n${trimmedRaw}\n---\n${body.replace(/^\n+/, '')}`
}

export function updateFrontmatterProperty(markdown: string, key: string, value: FrontmatterValue): string {
  const safeKey = key.trim()
  if (!safeKey || !/^[A-Za-z0-9_-]+$/.test(safeKey)) return markdown

  const block = extractFrontmatter(markdown)
  const body = block ? markdown.slice(block.end) : markdown
  let raw = block?.raw || ''
  raw = writeProperty(raw, safeKey, Array.isArray(value) ? normalizeList(value.map(String)) : value)

  const trimmedRaw = raw.trim()
  if (!trimmedRaw) return body.replace(/^\n+/, '')
  return `---\n${trimmedRaw}\n---\n${body.replace(/^\n+/, '')}`
}

export function updateMarkdownProperty(markdown: string, key: string, value: FrontmatterValue): string {
  const safeKey = key.trim()
  if (!safeKey || !/^[A-Za-z0-9_-]+$/.test(safeKey)) return markdown

  const block = extractFrontmatter(markdown)
  if (block && findPropertyRange(block.raw.split('\n'), safeKey)) {
    return updateFrontmatterProperty(markdown, safeKey, value)
  }

  const inlineUpdated = updateDataviewInlineProperty(markdown, safeKey, value)
  return inlineUpdated ?? updateFrontmatterProperty(markdown, safeKey, value)
}

function extractFrontmatter(markdown: string): { raw: string; end: number } | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  return match ? { raw: match[1], end: match[0].length } : null
}

function updateDataviewInlineProperty(markdown: string, key: string, value: FrontmatterValue): string | null {
  const lines = markdown.split('\n')
  const fieldPattern = new RegExp(`^(\\s*(?:[-*+]\\s+(?:\\[[^\\]\\r\\n]?\\]\\s+)?)?)${escapeRegExp(key)}::\\s*(.*?)\\s*$`)
  let inFence = false

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = lines[index].match(fieldPattern)
    if (!match) continue

    const serialized = serializeInlineValue(value)
    if (serialized === null) lines.splice(index, 1)
    else lines[index] = `${match[1]}${key}:: ${serialized}`
    return lines.join('\n')
  }

  return null
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

function readTags(raw: string): string[] {
  return readList(raw, 'tags')
    .flatMap((tag) => tag.split(/[\s,]+/))
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean)
}

function readCssClasses(raw: string, key: string): string[] {
  return readList(raw, key)
    .flatMap((className) => className.split(/[\s,]+/))
    .map((className) => className.trim())
    .filter(Boolean)
}

function writeProperty(raw: string, key: string, value: FrontmatterValue): string {
  const nextBlock = Array.isArray(value)
    ? value.length > 0 ? [`${key}:`, ...value.map((item) => `  - ${serializeScalar(item)}`)] : []
    : value !== null && String(value).trim() !== '' ? [`${key}: ${serializeScalar(value)}`] : []

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

function serializeScalar(value: FrontmatterScalar): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : JSON.stringify(String(value))
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return JSON.stringify(value)
}

function serializeInlineValue(value: FrontmatterValue): string | null {
  if (Array.isArray(value)) {
    const items = normalizeList(value.map(String))
    return items.length > 0 ? items.join(', ') : null
  }
  if (value === null || String(value).trim() === '') return null
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : String(value)
  return value.trim()
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
