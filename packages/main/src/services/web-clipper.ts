import { BrowserWindow } from 'electron'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { mkdir, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { store } from './store'
import { indexNote } from './indexer'

export interface WebClipPayload {
  title?: string
  url?: string
  selection?: string
  text?: string
  html?: string
}

export interface WebClipResult {
  ok: boolean
  path?: string
  error?: string
}

const CLIPPER_PORT = 17321
const MAX_BODY_BYTES = 2 * 1024 * 1024
let server: Server | null = null

export function safeClipFileName(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'Untitled Web Clip').slice(0, 120)
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
}

function textFromHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
}

function markdownLinkText(value: string): string {
  return value.replace(/[\[\]]/g, '').trim()
}

function markdownLinkUrl(value: string): string {
  return value.replace(/\)/g, '%29').trim()
}

function normalizeClipHref(value: string, baseUrl?: string): string {
  const href = decodeHtmlEntities(value).trim()
  try {
    const url = baseUrl ? new URL(href, baseUrl) : new URL(href)
    return /^https?:$/i.test(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function stripHtml(html?: string, baseUrl?: string): string {
  if (!html) return ''
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs: string, labelHtml: string) => {
      const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const href = hrefMatch ? normalizeClipHref(hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '', baseUrl) : ''
      if (!href) return textFromHtml(labelHtml)
      const label = markdownLinkText(textFromHtml(labelHtml) || href)
      return `[${label}](${markdownLinkUrl(href)})`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(decodeHtmlEntities)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatWebClipMarkdown(payload: WebClipPayload, capturedAt = new Date()): { title: string; markdown: string } {
  const title = safeClipFileName(payload.title || payload.url || 'Untitled Web Clip')
  const source = payload.url?.trim()
  const body = (payload.selection || stripHtml(payload.html, source) || payload.text || '').trim()
  const lines = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `source: ${source ? `"${source.replace(/"/g, '\\"')}"` : '""'}`,
    `captured: "${capturedAt.toISOString()}"`,
    'tags:',
    '  - web-clip',
    '---',
    '',
    `# ${title}`,
    '',
    source ? `Source: ${source}` : '',
    '',
    body || '_No readable page text was captured._',
    ''
  ]
  return { title, markdown: lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n') }
}

async function getUniqueClipPath(vaultPath: string, title: string, capturedAt: Date): Promise<string> {
  const date = capturedAt.toISOString().slice(0, 10)
  const dir = join(vaultPath, 'Clippings')
  const base = safeClipFileName(`${date} ${title}`)
  await mkdir(dir, { recursive: true })
  for (let i = 0; i < 1000; i += 1) {
    const suffix = i === 0 ? '' : ` ${i + 1}`
    const filePath = join(dir, `${base}${suffix}.md`)
    try {
      await access(filePath)
    } catch {
      return filePath
    }
  }
  return join(dir, `${base} ${Date.now()}.md`)
}

function notifyVaultChanged(changedPaths: string[] = []): void {
  const getAllWindows = BrowserWindow?.getAllWindows
  if (typeof getAllWindows !== 'function') return
  for (const window of getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('vault:files-changed', changedPaths)
  }
}

export async function saveWebClip(vaultPath: string, payload: WebClipPayload, capturedAt = new Date()): Promise<WebClipResult> {
  const { title, markdown } = formatWebClipMarkdown(payload, capturedAt)
  const filePath = await getUniqueClipPath(vaultPath, title, capturedAt)
  await writeFile(filePath, markdown, 'utf-8')
  try { indexNote(vaultPath, filePath) } catch {}
  notifyVaultChanged([filePath])
  return { ok: true, path: filePath }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('剪藏内容过大'))
        req.destroy()
        return
      }
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

export function startWebClipperServer(): void {
  if (server) return
  const next = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {})
      return
    }
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, app: 'Nexusky', feature: 'web-clipper' })
      return
    }
    if (req.method !== 'POST' || req.url !== '/clip') {
      sendJson(res, 404, { ok: false, error: 'Not found' })
      return
    }
    const vaultPath = store.get('vaultPath') as string | null
    if (!vaultPath) {
      sendJson(res, 409, { ok: false, error: 'Nexusky 当前未打开 vault' })
      return
    }
    try {
      const payload = JSON.parse(await readBody(req)) as WebClipPayload
      const result = await saveWebClip(vaultPath, payload)
      sendJson(res, 200, result)
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  })
  next.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[web-clipper] port ${CLIPPER_PORT} already in use; web-clipper disabled for this session`)
    } else {
      console.warn('[web-clipper] server error:', err.message)
    }
    server = null
  })
  next.listen(CLIPPER_PORT, '127.0.0.1', () => {
    server = next
  })
}

export function stopWebClipperServer(): void {
  server?.close()
  server = null
}
