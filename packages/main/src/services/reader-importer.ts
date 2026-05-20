import { access, mkdir, readFile, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { indexNote } from './indexer'

export interface ReaderImportResult {
  imported: number
  skipped: number
  indexed: number
  canceled?: boolean
}

interface HighlightRow {
  title: string
  author?: string
  url?: string
  highlight: string
  note?: string
  tags: string[]
  highlightedAt?: string
}

const headerAliases = {
  title: ['title', 'booktitle', 'documenttitle', 'article title'],
  author: ['author', 'authors'],
  url: ['url', 'sourceurl', 'source url', 'document url', 'article url'],
  highlight: ['highlight', 'text', 'quote', 'content'],
  note: ['note', 'annotation'],
  tags: ['tags', 'tag'],
  highlightedAt: ['highlightedat', 'highlighted at', 'date', 'createdat', 'created at']
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ')
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    const next = content[i + 1]
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') {
      cell += ch
    }
  }

  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

function getValue(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record[normalizeHeader(alias)]
    if (value?.trim()) return value.trim()
  }
  return ''
}

export function parseReadwiseCsv(content: string): HighlightRow[] {
  const rows = parseCsv(content)
  if (rows.length < 2) return []

  const headers = rows[0].map(normalizeHeader)
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = cells[index] || ''
    })
    const tags = getValue(record, headerAliases.tags)
      .split(/[;,]/)
      .map((tag) => tag.trim().replace(/\s+/g, '-'))
      .filter(Boolean)
    return {
      title: getValue(record, headerAliases.title) || 'Untitled Highlight',
      author: getValue(record, headerAliases.author),
      url: getValue(record, headerAliases.url),
      highlight: getValue(record, headerAliases.highlight),
      note: getValue(record, headerAliases.note),
      tags,
      highlightedAt: getValue(record, headerAliases.highlightedAt)
    }
  }).filter((row) => row.highlight)
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'Untitled Highlight'
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

async function uniquePath(dir: string, title: string): Promise<string> {
  const safe = sanitizeFileName(title)
  for (let i = 0; i < 1000; i++) {
    const suffix = i === 0 ? '' : ` ${i + 1}`
    const candidate = join(dir, `${safe}${suffix}.md`)
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
  return join(dir, `${safe} ${Date.now()}.md`)
}

function renderHighlightNote(title: string, rows: HighlightRow[]): string {
  const first = rows[0]
  const tags = Array.from(new Set(['readwise', ...rows.flatMap((row) => row.tags)]))
  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    'source: readwise',
    first.author ? `author: ${yamlString(first.author)}` : '',
    first.url ? `url: ${yamlString(first.url)}` : '',
    'tags:',
    ...tags.map((tag) => `  - ${tag}`),
    '---'
  ].filter(Boolean)

  const body = rows.map((row, index) => {
    const lines = [
      `## Highlight ${index + 1}`,
      '',
      row.highlight.split('\n').map((line) => `> ${line}`).join('\n'),
      row.note ? `\n**Note:** ${row.note}` : '',
      row.highlightedAt ? `\n- Highlighted: ${row.highlightedAt}` : '',
      row.url ? `- Source: ${row.url}` : ''
    ]
    return lines.filter(Boolean).join('\n')
  })

  return [
    frontmatter.join('\n'),
    '',
    `# ${title}`,
    first.author ? `\nAuthor: ${first.author}` : '',
    first.url ? `Source: ${first.url}` : '',
    '',
    body.join('\n\n')
  ].filter(Boolean).join('\n') + '\n'
}

export async function importReadwiseCsv(sourcePath: string, vaultPath: string): Promise<ReaderImportResult> {
  const content = await readFile(sourcePath, 'utf-8')
  const rows = parseReadwiseCsv(content)
  const result: ReaderImportResult = { imported: 0, skipped: 0, indexed: 0 }
  if (rows.length === 0) {
    result.skipped = 1
    return result
  }

  const groups = new Map<string, HighlightRow[]>()
  for (const row of rows) {
    const key = `${row.title}\u0000${row.author || ''}\u0000${row.url || ''}`
    groups.set(key, [...(groups.get(key) || []), row])
  }

  const importDir = join(vaultPath, 'Imports', 'Readwise')
  await mkdir(importDir, { recursive: true })

  for (const groupedRows of groups.values()) {
    const title = groupedRows[0].title || basename(sourcePath, '.csv')
    const destPath = await uniquePath(importDir, title)
    await writeFile(destPath, renderHighlightNote(title, groupedRows), 'utf-8')
    indexNote(vaultPath, destPath)
    result.imported++
    result.indexed++
  }

  return result
}
