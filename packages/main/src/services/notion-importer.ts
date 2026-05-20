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

function decodeHtmlEntity(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
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

function stripTags(value: string): string {
  return decodeHtmlEntity(value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
}

function htmlAttr(tag: string, attr: string): string {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return decodeHtmlEntity(match?.[2] || match?.[3] || '')
}

function convertHtmlLinks(content: string): { content: string; converted: number } {
  let converted = 0
  const linked = content.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match, attrs: string, labelHtml: string) => {
    const href = htmlAttr(attrs, 'href')
    const label = stripTags(labelHtml) || href
    if (!href) return label
    const target = safeDecode(href).replace(/[?#].*$/, '')
    const ext = extname(target).toLowerCase()
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target) && (ext === '.html' || ext === '.htm' || ext === '.md')) {
      const title = notionTitleFromPath(target)
      converted++
      return label === title ? `[[${title}]]` : `[[${title}|${label}]]`
    }
    return `[${label}](${href})`
  })
  return { content: linked, converted }
}

export function convertNotionHtmlToMarkdown(content: string, fallbackTitle: string): { title: string; content: string; converted: number } {
  const title = sanitizeSegment(stripTags(content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || fallbackTitle))
  let body = content
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
      const src = htmlAttr(attrs, 'src')
      const alt = htmlAttr(attrs, 'alt')
      return src ? `![${alt}](${src})` : ''
    })

  const linkResult = convertHtmlLinks(body)
  body = linkResult.content
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, inner: string) => `\n${'#'.repeat(Number(level))} ${stripTags(inner)}\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner: string) => `\n- ${stripTags(inner)}`)
    .replace(/<(p|div|section|article|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(ul|ol|html|head|body|main|span|strong|em|b|i)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => decodeHtmlEntity(line).trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const markdown = [
    frontmatterFor(title || fallbackTitle, 'page'),
    body || `# ${title || fallbackTitle}`,
    ''
  ].join('\n')
  return { title: title || fallbackTitle, content: markdown, converted: 1 + linkResult.converted }
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
    } else if (ext === '.html' || ext === '.htm') {
      const converted = convertNotionHtmlToMarkdown(await readFile(sourceFile, 'utf-8'), title)
      const destPath = await uniqueFilePath(destDir, converted.title, '.md')
      await writeFile(destPath, converted.content, 'utf-8')
      indexNote(vaultPath, destPath)
      result.imported++
      result.converted += converted.converted
      result.indexed++
    } else {
      const destPath = await uniqueFilePath(destDir, basename(sourceFile, ext), ext)
      await copyFile(sourceFile, destPath)
      result.assets++
    }
  }

  return result
}
