import { createHash, createHmac } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join, relative } from 'path'
import { store } from '../store'
import type { SyncFileInfo, SyncProvider, SyncResult } from './provider'

export interface S3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  prefix?: string
}

export interface S3ListObject {
  key: string
  etag: string
  lastModified: string
}

function getConfig(): S3Config | null {
  const config = normalizeS3Config(store.get('s3Config') as Partial<S3Config> | undefined)
  return config.endpoint && config.bucket && config.accessKeyId && config.secretAccessKey ? config : null
}

export function normalizeS3Config(config: Partial<S3Config> | null | undefined): S3Config {
  return {
    endpoint: (config?.endpoint || '').trim().replace(/\/+$/, ''),
    region: (config?.region || 'us-east-1').trim() || 'us-east-1',
    bucket: (config?.bucket || '').trim(),
    accessKeyId: (config?.accessKeyId || '').trim(),
    secretAccessKey: config?.secretAccessKey || '',
    prefix: (config?.prefix || '').trim().replace(/^\/+|\/+$/g, '')
  }
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

export function s3ObjectKey(config: S3Config, relPath: string): string {
  const normalized = normalizeS3Config(config)
  return [normalized.prefix, relPath.replace(/^\/+/, '')].filter(Boolean).join('/')
}

export function buildS3ObjectUrl(config: S3Config, relPath = ''): string {
  const normalized = normalizeS3Config(config)
  const path = [normalized.bucket, s3ObjectKey(normalized, relPath)].filter(Boolean).map(encodeKey).join('/')
  return `${normalized.endpoint}/${path}`
}

export function buildS3ListUrl(config: S3Config): string {
  const normalized = normalizeS3Config(config)
  const params = new URLSearchParams({ 'list-type': '2', prefix: normalized.prefix ? `${normalized.prefix}/` : '' })
  return `${normalized.endpoint}/${encodeURIComponent(normalized.bucket)}?${params.toString()}`
}

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function xmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function parseS3ListObjects(xml: string): S3ListObject[] {
  return Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)).map((match) => {
    const block = match[1]
    const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] || ''
    const etag = block.match(/<ETag>([\s\S]*?)<\/ETag>/)?.[1] || ''
    const lastModified = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] || ''
    return {
      key: xmlDecode(key),
      etag: xmlDecode(etag).replace(/^"|"$/g, ''),
      lastModified: xmlDecode(lastModified)
    }
  }).filter((item) => item.key)
}

function relPathFromKey(config: S3Config, key: string): string | null {
  const prefix = normalizeS3Config(config).prefix
  const rel = prefix ? key.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), '') : key
  if (!rel || rel === key && prefix && !key.startsWith(`${prefix}/`)) return null
  return rel
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

export function signS3Request(config: S3Config, method: string, url: string, body: string | Buffer = '', extraHeaders: Record<string, string> = {}, date = new Date()): Record<string, string> {
  const normalized = normalizeS3Config(config)
  const parsed = new URL(url)
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateScope = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(body)
  const headers: Record<string, string> = {
    host: parsed.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([key, value]) => [key.toLowerCase(), value.trim()]))
  }
  const canonicalHeaders = Object.keys(headers).sort().map((key) => `${key}:${headers[key]}\n`).join('')
  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalQuery = Array.from(parsed.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  const canonicalRequest = [method, parsed.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateScope}/${normalized.region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${normalized.secretAccessKey}`, dateScope), normalized.region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${normalized.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  }
}

async function s3Fetch(config: S3Config, method: string, url: string, body?: Buffer, headers: Record<string, string> = {}): Promise<Response> {
  const signedHeaders = signS3Request(config, method, url, body || '', headers)
  return fetch(url, { method, headers: signedHeaders, body: body as unknown as RequestInit['body'] })
}

export class S3SyncProvider implements SyncProvider {
  readonly type = 's3' as const
  readonly name = 'S3'

  isConfigured(): boolean {
    return getConfig() !== null
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const config = getConfig()
    if (!config) return { ok: false, error: '未配置 S3' }
    try {
      const res = await s3Fetch(config, 'GET', buildS3ListUrl(config))
      if (res.ok) return { ok: true }
      return { ok: false, error: `HTTP ${res.status}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async pushFile(vaultPath: string, filePath: string): Promise<boolean> {
    const config = getConfig()
    if (!config) return false
    const body = readFileSync(filePath)
    const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    const res = await s3Fetch(config, 'PUT', buildS3ObjectUrl(config, relPath), body, {
      'content-type': extname(filePath) === '.json' ? 'application/json' : 'text/markdown; charset=utf-8',
      'x-amz-meta-content-md5': createHash('md5').update(body).digest('hex')
    })
    return res.ok
  }

  async pullFile(vaultPath: string, relPath: string): Promise<boolean> {
    const config = getConfig()
    if (!config) return false
    const res = await s3Fetch(config, 'GET', buildS3ObjectUrl(config, relPath))
    if (!res.ok) return false
    const fullPath = join(vaultPath, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, await res.text(), 'utf-8')
    return true
  }

  async listRemoteFiles(): Promise<SyncFileInfo[]> {
    const config = getConfig()
    if (!config) return []
    const res = await s3Fetch(config, 'GET', buildS3ListUrl(config))
    if (!res.ok) return []
    return parseS3ListObjects(await res.text())
      .map((object) => {
        const rel = relPathFromKey(config, object.key)
        if (!rel || !(extname(rel) === '.md' || rel.startsWith('.nexusky/memories/') && extname(rel) === '.json')) return null
        return { path: rel, hash: object.etag, updatedAt: object.lastModified || new Date().toISOString() }
      })
      .filter((item): item is SyncFileInfo => !!item)
  }

  async syncAll(vaultPath: string): Promise<SyncResult> {
    if (!getConfig()) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置 S3'] }
    const result: SyncResult = { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    const remoteFiles = await this.listRemoteFiles()
    const remoteMap = new Map(remoteFiles.map((file) => [file.path, file]))
    const localFiles = collectLocalFiles(vaultPath)
    result.total = localFiles.length
    for (const filePath of localFiles) {
      const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
      const localHash = createHash('md5').update(readFileSync(filePath)).digest('hex')
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
      if (!existsSync(join(vaultPath, relPath))) {
        result.total++
        if (await this.pullFile(vaultPath, relPath)) result.pulled++
        else result.errors.push(`pull failed: ${relPath}`)
      }
    }
    return result
  }

  async pullAll(vaultPath: string): Promise<SyncResult> {
    if (!getConfig()) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置 S3'] }
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
