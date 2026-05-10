import { getSupabaseClient } from './client'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, relative } from 'path'
import { createHash } from 'crypto'

export interface SyncStatus {
  total: number
  synced: number
  errors: string[]
}

export async function pushNote(vaultPath: string, filePath: string): Promise<boolean> {
  const client = getSupabaseClient()
  if (!client) return false

  const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
  const content = readFileSync(filePath, 'utf-8')
  const hash = createHash('md5').update(content).digest('hex')

  const { error } = await client.storage
    .from('notes')
    .upload(relPath, content, {
      contentType: 'text/markdown',
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

export async function pullNote(vaultPath: string, relPath: string): Promise<boolean> {
  const client = getSupabaseClient()
  if (!client) return false

  const { data, error } = await client.storage
    .from('notes')
    .download(relPath)

  if (error || !data) {
    console.error('Pull failed:', relPath, error?.message)
    return false
  }

  const content = await data.text()
  const fullPath = join(vaultPath, relPath)
  const dir = fullPath.substring(0, fullPath.lastIndexOf(/[\\/]/.test(fullPath) ? fullPath.match(/[\\/]/)?.[0] || '/' : '/'))

  const { mkdirSync } = require('fs')
  const { dirname } = require('path')
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  return true
}

export async function syncVault(vaultPath: string): Promise<SyncStatus> {
  const client = getSupabaseClient()
  if (!client) return { total: 0, synced: 0, errors: ['未配置云端'] }

  const status: SyncStatus = { total: 0, synced: 0, errors: [] }

  const { data: remoteFiles } = await client.from('note_sync').select('file_path, content_hash, updated_at')
  const remoteMap = new Map((remoteFiles || []).map((f: any) => [f.file_path, f]))

  const localFiles = collectLocalFiles(vaultPath)
  status.total = localFiles.length

  for (const filePath of localFiles) {
    const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    const content = readFileSync(filePath, 'utf-8')
    const localHash = createHash('md5').update(content).digest('hex')
    const remote = remoteMap.get(relPath) as any

    if (!remote || remote.content_hash !== localHash) {
      const ok = await pushNote(vaultPath, filePath)
      if (ok) status.synced++
      else status.errors.push(`push failed: ${relPath}`)
    } else {
      status.synced++
    }
    remoteMap.delete(relPath)
  }

  for (const [relPath] of remoteMap) {
    const fullPath = join(vaultPath, relPath)
    if (!existsSync(fullPath)) {
      const ok = await pullNote(vaultPath, relPath)
      if (ok) status.synced++
      else status.errors.push(`pull failed: ${relPath}`)
      status.total++
    }
  }

  return status
}

function collectLocalFiles(dirPath: string): string[] {
  const { readdirSync } = require('fs')
  const { join: pathJoin, extname } = require('path')
  const results: string[] = []

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = pathJoin(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (extname(entry.name) === '.md') results.push(full)
    }
  }

  walk(dirPath)
  return results
}
