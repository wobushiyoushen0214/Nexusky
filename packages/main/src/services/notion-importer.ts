import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'fs/promises'
import { basename, dirname, extname, join, relative } from 'path'
import { indexNote } from './indexer'

export interface NotionImportResult {
  imported: number
  converted: number
  indexed: number
  assets: number
  skipped: number
  canceled?: boolean
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripNotionId(value: string): string {
  return value
    .replace(/\s+[0-9a-f]{32}$/i, '')
    .replace(/\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
    .replace(/\s+[0-9a-f]{12,}$/i, '')
    .trim()
}

function sanitizeSegment(value: string): string {
  return stripNotionId(safeDecode(value))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'Untitled'
}

export function notionTitleFromPath(filePath: string): string {
  return sanitizeSegment(basename(filePath, extname(filePath)))
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

async function uniqueFilePath(dir: string, title: string, extension: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  const safeTitle = sanitizeSegment(title)
  for (let i = 0; i < 1000; i++) {
    const suffix = i === 0 ? '' : ` ${i + 1}`
    const candidate = join(dir, `${safeTitle}${suffix}${extension}`)
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
  return join(dir, `${safeTitle} ${Date.now()}${extension}`)
}

function frontmatterFor(title: string, type: 'page' | 'database'): string {
  return [
    '---',
    `title: ${yamlString(title)}`,
    'source: notion',
    `type: ${type}`,
    'tags:',
    '  - notion',
    type === 'database' ? '  - database' : '',
    '---',
    ''
  ].filter(Boolean).join('\n')
}

export function convertNotionMarkdownLinks(content: string): { content: string; converted: number } {
  let converted = 0
  const updated = content.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (match, bang: string, label: string, rawTarget: string) => {
    const target = safeDecode(rawTarget.trim())
    if (bang || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return match
    const cleanTarget = target.replace(/[?#].*$/, '')
    if (extname(cleanTarget).toLowerCase() !== '.md') return `[${label}](${target})`
    const title = notionTitleFromPath(cleanTarget)
    converted++
    const cleanLabel = label.trim()
    if (!cleanLabel || cleanLabel === title) return `[[${title}]]`
    return `[[${title}|${cleanLabel}]]`
  })
  return { content: updated, converted }
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

function tableCell(value: string): string {
  return value.replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim()
}

export function convertNotionCsvToMarkdown(content: string, title: string): string {
  const rows = parseCsv(content)
  if (rows.length === 0) return `${frontmatterFor(title, 'database')}# ${title}\n`

  const headers = rows[0].map((cell, index) => tableCell(cell) || `Column ${index + 1}`)
  const body = rows.slice(1)
  const table = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${headers.map((_, index) => tableCell(row[index] || '')).join(' | ')} |`)
  ]
  return [
    frontmatterFor(title, 'database'),
    `# ${title}`,
    '',
    table.join('\n'),
    ''
  ].join('\n')
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }
  return files
}

function destinationDir(sourceRoot: string, sourceFile: string, importRoot: string): string {
  const relDir = dirname(relative(sourceRoot, sourceFile))
  if (relDir === '.') return importRoot
  return join(importRoot, ...relDir.split(/[\\/]/).map(sanitizeSegment))
}

export async function importNotionExport(sourcePath: string, vaultPath: string): Promise<NotionImportResult> {
  const sourceStat = await stat(sourcePath)
  const result: NotionImportResult = { imported: 0, converted: 0, indexed: 0, assets: 0, skipped: 0 }
  if (!sourceStat.isDirectory()) {
    result.skipped = 1
    return result
  }

  const importRoot = join(vaultPath, 'Imports', 'Notion')
  await mkdir(importRoot, { recursive: true })
  const files = await walkFiles(sourcePath)

  for (const sourceFile of files) {
    const ext = extname(sourceFile).toLowerCase()
    const title = notionTitleFromPath(sourceFile)
    const destDir = destinationDir(sourcePath, sourceFile, importRoot)

    if (ext === '.md') {
      const raw = await readFile(sourceFile, 'utf-8')
      const converted = convertNotionMarkdownLinks(raw)
      const hasFrontmatter = converted.content.trimStart().startsWith('---')
      const content = hasFrontmatter ? converted.content : `${frontmatterFor(title, 'page')}${converted.content}`
      const destPath = await uniqueFilePath(destDir, title, '.md')
      await writeFile(destPath, content, 'utf-8')
      indexNote(vaultPath, destPath)
      result.imported++
      result.converted += converted.converted
      result.indexed++
    } else if (ext === '.csv') {
      const markdown = convertNotionCsvToMarkdown(await readFile(sourceFile, 'utf-8'), title)
      const destPath = await uniqueFilePath(destDir, title, '.md')
      await writeFile(destPath, markdown, 'utf-8')
      indexNote(vaultPath, destPath)
      result.imported++
      result.converted++
      result.indexed++
    } else {
      const destPath = await uniqueFilePath(destDir, basename(sourceFile, ext), ext)
      await copyFile(sourceFile, destPath)
      result.assets++
    }
  }

  return result
}
