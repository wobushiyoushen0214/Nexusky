import { SyncProvider, SyncFileInfo, SyncResult, SyncConflict } from './provider'
import { getSupabaseClient, getAdminClient } from './client'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs'
import { join, relative, dirname, extname } from 'path'
import { createHash } from 'crypto'

function encodeSegment(segment: string): string {
  if (/^[\w\-.]+$/.test(segment)) return segment
  const ext = extname(segment)
  const hash = createHash('md5').update(segment).digest('hex')
  return ext ? `${hash}${ext}` : hash
}

function encodeStoragePath(relPath: string): string {
  if (/^[\w\-./]+$/.test(relPath)) return relPath
  return relPath.split('/').map((seg) => encodeSegment(seg)).join('/')
}

async function runConcurrent<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = []
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
  return results
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
    const memFiles = readdirSync(memoriesDir, { withFileTypes: true })
    for (const entry of memFiles) {
      if (entry.isFile() && extname(entry.name) === '.json') {
        results.push(join(memoriesDir, entry.name))
      }
    }
  }

  return results
}

export class SupabaseSyncProvider implements SyncProvider {
  readonly type = 'supabase' as const
  readonly name = 'Supabase'

  isConfigured(): boolean {
    return !!(getAdminClient() || getSupabaseClient())
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const client = getAdminClient() || getSupabaseClient()
    if (!client) return { ok: false, error: '未配置 Supabase' }
    const { error } = await client.from('note_sync').select('id').limit(1)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  async pushFile(vaultPath: string, filePath: string): Promise<boolean> {
    const client = getAdminClient() || getSupabaseClient()
    if (!client) return false

    const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    const storagePath = encodeStoragePath(relPath)
    const content = readFileSync(filePath, 'utf-8')
    const hash = createHash('md5').update(content).digest('hex')

    const contentType = extname(filePath) === '.json'
      ? 'application/json; charset=utf-8'
      : 'text/markdown; charset=utf-8'

    const { error } = await client.storage
      .from('notes')
      .upload(storagePath, content, {
        contentType,
        upsert: true
      })

    if (error) {
      console.error('Push failed:', relPath, error.message)
      return false
    }

    await client.from('note_sync').upsert({
      file_path: relPath,
      content_hash: hash,
      updated_at: new Date().toISOString()
    }, { onConflict: 'file_path' })

    return true
  }
  async pullFile(vaultPath: string, relPath: string): Promise<boolean> {
    const client = getAdminClient() || getSupabaseClient()
    if (!client) return false

    const storagePath = encodeStoragePath(relPath)
    const { data, error } = await client.storage
      .from('notes')
      .download(storagePath)

    if (error || !data) {
      console.error('Pull failed:', relPath, error?.message)
      return false
    }

    const content = await data.text()
    const fullPath = join(vaultPath, relPath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
    return true
  }

  async listRemoteFiles(): Promise<SyncFileInfo[]> {
    const client = getAdminClient() || getSupabaseClient()
    if (!client) return []

    const { data } = await client.from('note_sync').select('file_path, content_hash, updated_at')
    return (data || []).map((f: any) => ({
      path: f.file_path,
      hash: f.content_hash,
      updatedAt: f.updated_at
    }))
  }

  async syncAll(vaultPath: string): Promise<SyncResult> {
    const client = getAdminClient() || getSupabaseClient()
    if (!client) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置云端'] }

    const result: SyncResult = { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }

    const remoteFiles = await this.listRemoteFiles()
    const remoteMap = new Map(remoteFiles.map((f) => [f.path, f]))

    const localFiles = collectLocalFiles(vaultPath)
    result.total = localFiles.length

    const pushTasks: (() => Promise<void>)[] = []

    for (const filePath of localFiles) {
      const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
      const content = readFileSync(filePath, 'utf-8')
      const localHash = createHash('md5').update(content).digest('hex')
      const remote = remoteMap.get(relPath)

      if (!remote) {
        pushTasks.push(async () => {
          const ok = await this.pushFile(vaultPath, filePath)
          if (ok) result.pushed++
          else result.errors.push(`push failed: ${relPath}`)
        })
      } else if (remote.hash !== localHash) {
        const localMtime = statSync(filePath).mtime
        const remoteMtime = new Date(remote.updatedAt)
        if (remoteMtime > localMtime) {
          result.conflicts.push({ path: relPath, localHash, remoteHash: remote.hash, remoteUpdatedAt: remote.updatedAt })
        } else {
          pushTasks.push(async () => {
            const ok = await this.pushFile(vaultPath, filePath)
            if (ok) result.pushed++
            else result.errors.push(`push failed: ${relPath}`)
          })
        }
      }
      remoteMap.delete(relPath)
    }

    await runConcurrent(pushTasks, 5)

    const pullTasks: (() => Promise<void>)[] = []
    for (const [relPath] of remoteMap) {
      const fullPath = join(vaultPath, relPath)
      if (!existsSync(fullPath)) {
        result.total++
        pullTasks.push(async () => {
          const ok = await this.pullFile(vaultPath, relPath)
          if (ok) result.pulled++
          else result.errors.push(`pull failed: ${relPath}`)
        })
      }
    }

    await runConcurrent(pullTasks, 5)

    return result
  }

  async pullAll(vaultPath: string): Promise<SyncResult> {
    const client = getAdminClient() || getSupabaseClient()
    if (!client) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['未配置云端'] }

    const result: SyncResult = { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }

    const remoteFiles = await this.listRemoteFiles()
    result.total = remoteFiles.length

    const pullTasks: (() => Promise<void>)[] = []

    for (const remote of remoteFiles) {
      const fullPath = join(vaultPath, remote.path)
      let needPull = false

      if (!existsSync(fullPath)) {
        needPull = true
      } else {
        const content = readFileSync(fullPath, 'utf-8')
        const localHash = createHash('md5').update(content).digest('hex')
        if (localHash !== remote.hash) needPull = true
      }

      if (needPull) {
        pullTasks.push(async () => {
          const ok = await this.pullFile(vaultPath, remote.path)
          if (ok) result.pulled++
          else result.errors.push(`pull failed: ${remote.path}`)
        })
      }
    }

    await runConcurrent(pullTasks, 5)

    return result
  }
}
