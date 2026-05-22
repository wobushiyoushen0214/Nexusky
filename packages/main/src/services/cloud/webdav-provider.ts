import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join, relative } from 'path'
import { store } from '../store'
import { logger } from '../logger'
import type { SyncFileInfo, SyncProvider, SyncResult } from './provider'

export interface WebDavConfig {
  url: string
  username?: string
  password?: string
  folder: string
}

const insecureWarned = new Set<string>()
function warnIfInsecureWebDav(url: string): void {
  if (!url) return
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  const host = parsed.hostname
  if (parsed.protocol !== 'http:') return
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return
  const key = `${parsed.protocol}//${parsed.host}`
  if (insecureWarned.has(key)) return
  insecureWarned.add(key)
  logger.warn('WebDAV endpoint uses plain HTTP. Credentials and notes will travel unencrypted.', {
    host: parsed.host,
  })
}

function getConfig(): WebDavConfig | null {
  const config = store.get('webdavConfig') as Partial<WebDavConfig> | undefined
  if (!config?.url) return null
  return {
    url: config.url,
    username: config.username || '',
    password: config.password || '',
    folder: config.folder || '/Nexusky'
  }
}

export function normalizeWebDavConfig(config: Partial<WebDavConfig> | null | undefined): WebDavConfig {
  const url = (config?.url || '').trim().replace(/\/+$/, '')
  const folder = `/${(config?.folder || '/Nexusky').trim().replace(/^\/+|\/+$/g, '')}`
  warnIfInsecureWebDav(url)
  return {
    url,
    username: config?.username || '',
    password: config?.password || '',
    folder
  }
}

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

export function buildWebDavUrl(config: WebDavConfig, relPath = ''): string {
  const normalized = normalizeWebDavConfig(config)
  const folder = encodePath(normalized.folder)
  const file = encodePath(relPath)
  return [normalized.url, folder, file].filter(Boolean).join('/')
}

function authHeaders(config: WebDavConfig): Record<string, string> {
  if (!config.username && !config.password) return {}
  return { Authorization: `Basic ${Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64')}` }
}

function collectLocalFiles(dirPath: string): string[] {
  const results: string[] = []
  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (extname(entry.name) === '.md') results.push(full)
    }
  }
  walk(dirPath)

  const memoriesDir = join(dirPath, '.nexusky', 'memories')
  if (existsSync(memoriesDir)) {
    for (const entry of readdirSync(memoriesDir, { withFileTypes: true })) {
      if (entry.isFile() && extname(entry.name) === '.json') results.push(join(memoriesDir, entry.name))
    }
  }
  return results
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function parseWebDavHrefs(xml: string): string[] {
  return Array.from(xml.matchAll(/<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/gi))
    .map((match) => decodeXml(match[1].trim()))
}

export function hrefToRelPath(href: string, config: WebDavConfig): string | null {
  const folder = normalizeWebDavConfig(config).folder.replace(/^\/+|\/+$/g, '')
  const decodedPath = decodeURIComponent(href.split('?')[0]).replace(/\/+$/g, '')
  const marker = `/${folder}/`
  const index = decodedPath.indexOf(marker)
  if (index < 0) return null
  const rel = decodedPath.slice(index + marker.length)
  if (!rel || rel.endsWith('/')) return null
  return rel
}

async function request(config: WebDavConfig, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...authHeaders(config),
      ...(init.headers || {})
    }
  })
}

async function ensureRemoteDirs(config: WebDavConfig, relPath: string): Promise<void> {
  const parts = normalizeWebDavConfig(config).folder.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  const relParts = relPath.split('/').slice(0, -1)
  const allParts = [...parts, ...relParts]
  let current = normalizeWebDavConfig(config).url
  for (const part of allParts) {
    current = `${current}/${encodeURIComponent(part)}`
    const res = await request(config, current, { method: 'MKCOL' })
    if (![201, 405, 301, 302].includes(res.status) && !res.ok) throw new Error(`MKCOL failed: ${res.status}`)
  }
}

export class WebDavSyncProvider implements SyncProvider {
  readonly type = 'webdav' as const
  readonly name = 'WebDAV'

  isConfigured(): boolean {
    const config = getConfig()
    return !!config?.url
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const config = getConfig()
    if (!config) return { ok: false, error: '未配置 WebDAV' }
    try {
      const res = await request(config, buildWebDavUrl(config), { method: 'PROPFIND', headers: { Depth: '0' } })
      if (res.ok || [207, 404].includes(res.status)) return { ok: true }
      return { ok: false, error: `HTTP ${res.status}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async pushFile(vaultPath: string, filePath: string): Promise<boolean> {
    const config = getConfig()
    if (!config) return false
    const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    await ensureRemoteDirs(config, relPath)
    const res = await request(config, buildWebDavUrl(config, relPath), {
      method: 'PUT',
      body: readFileSync(filePath),
      headers: { 'Content-Type': extname(filePath) === '.json' ? 'application/json' : 'text/markdown; charset=utf-8' }
    })
    return res.ok
  }

  async pullFile(vaultPath: string, relPath: string): Promise<boolean> {
    const config = getConfig()
    if (!config) return false
    const res = await request(config, buildWebDavUrl(config, relPath), { method: 'GET' })
    if (!res.ok) return false
    const content = await res.text()
    const fullPath = join(vaultPath, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
    return true
  }

  async listRemoteFiles(): Promise<SyncFileInfo[]> {
    const config = getConfig()
    if (!config) return []
    const res = await request(config, buildWebDavUrl(config), { method: 'PROPFIND', headers: { Depth: 'infinity' } })
    if (!res.ok && res.status !== 207) return []
    const hrefs = parseWebDavHrefs(await res.text())
    const relPaths = Array.from(new Set(hrefs.map((href) => hrefToRelPath(href, config)).filter((path): path is string => !!path)))
      .filter((path) => extname(path) === '.md' || path.startsWith('.nexusky/memories/') && extname(path) === '.json')
    const files: SyncFileInfo[] = []
    for (const path of relPaths) {
      const file = await request(config, buildWebDavUrl(config, path), { method: 'GET' })
      if (!file.ok) continue
      const content = await file.text()
      files.push({
        path,
        hash: createHash('md5').update(content).digest('hex'),
        updatedAt: file.headers.get('last-modified') ? new Date(file.headers.get('last-modified')!).toISOString() : new Date().toISOString()
      })
    }
    return files
  }

  async syncAll(vaultPath: string): Promise<SyncResult> {
    if (!getConfig()) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置 WebDAV'] }
    const result: SyncResult = { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    const remoteFiles = await this.listRemoteFiles()
    const remoteMap = new Map(remoteFiles.map((file) => [file.path, file]))
    const localFiles = collectLocalFiles(vaultPath)
    result.total = localFiles.length

    for (const filePath of localFiles) {
      const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
      const content = readFileSync(filePath)
      const localHash = createHash('md5').update(content).digest('hex')
      const remote = remoteMap.get(relPath)
      if (!remote) {
        if (await this.pushFile(vaultPath, filePath)) result.pushed++
        else result.errors.push(`push failed: ${relPath}`)
      } else if (remote.hash !== localHash) {
        const localMtime = statSync(filePath).mtime
        const remoteMtime = new Date(remote.updatedAt)
        if (remoteMtime > localMtime) result.conflicts.push({ path: relPath, localHash, remoteHash: remote.hash, remoteUpdatedAt: remote.updatedAt })
        else if (await this.pushFile(vaultPath, filePath)) result.pushed++
        else result.errors.push(`push failed: ${relPath}`)
      }
      remoteMap.delete(relPath)
    }

    for (const [relPath] of remoteMap) {
      const fullPath = join(vaultPath, relPath)
      if (!existsSync(fullPath)) {
        result.total++
        if (await this.pullFile(vaultPath, relPath)) result.pulled++
        else result.errors.push(`pull failed: ${relPath}`)
      }
    }
    return result
  }

  async pullAll(vaultPath: string): Promise<SyncResult> {
    if (!getConfig()) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置 WebDAV'] }
    const result: SyncResult = { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    const remoteFiles = await this.listRemoteFiles()
    result.total = remoteFiles.length
    for (const remote of remoteFiles) {
      const fullPath = join(vaultPath, remote.path)
      const localHash = existsSync(fullPath) ? createHash('md5').update(readFileSync(fullPath)).digest('hex') : ''
      if (localHash !== remote.hash) {
        if (await this.pullFile(vaultPath, remote.path)) result.pulled++
        else result.errors.push(`pull failed: ${remote.path}`)
      }
    }
    return result
  }
}
