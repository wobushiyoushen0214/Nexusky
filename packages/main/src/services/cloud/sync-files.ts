import { existsSync, readdirSync } from 'fs'
import { extname, join, relative } from 'path'

const ALLOWED_DOT_DIRS = new Set(['.attachments'])
const SKIPPED_DOT_DIRS = new Set(['.git', '.obsidian', '.trash'])
const MEMORY_PREFIX = '.nexusky/memories/'

export function normalizeSyncRelPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

export function shouldSyncRelPath(path: string): boolean {
  const relPath = normalizeSyncRelPath(path)
  if (!relPath) return false
  if (relPath.startsWith(MEMORY_PREFIX)) return extname(relPath) === '.json'
  if (relPath.startsWith('.nexusky/')) return false

  const segments = relPath.split('/')
  for (const segment of segments.slice(0, -1)) {
    if (SKIPPED_DOT_DIRS.has(segment)) return false
    if (segment.startsWith('.') && !ALLOWED_DOT_DIRS.has(segment)) return false
  }
  const fileName = segments[segments.length - 1]
  return !fileName.startsWith('.')
}

export function collectSyncLocalFiles(vaultPath: string): string[] {
  const results: string[] = []
  if (!existsSync(vaultPath)) return results

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const relPath = normalizeSyncRelPath(relative(vaultPath, fullPath))

      if (entry.isDirectory()) {
        if (relPath === '.nexusky') continue
        if (entry.name.startsWith('.') && !ALLOWED_DOT_DIRS.has(entry.name)) continue
        walk(fullPath)
      } else if (entry.isFile() && shouldSyncRelPath(relPath)) {
        results.push(fullPath)
      }
    }
  }

  walk(vaultPath)
  collectMemoryFiles(vaultPath, results)
  return results.sort((a, b) => normalizeSyncRelPath(relative(vaultPath, a)).localeCompare(normalizeSyncRelPath(relative(vaultPath, b))))
}

function collectMemoryFiles(vaultPath: string, results: string[]): void {
  const memoriesDir = join(vaultPath, '.nexusky', 'memories')
  if (!existsSync(memoriesDir)) return

  for (const entry of readdirSync(memoriesDir, { withFileTypes: true })) {
    if (entry.isFile() && extname(entry.name) === '.json') {
      results.push(join(memoriesDir, entry.name))
    }
  }
}

export function getSyncContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.md':
      return 'text/markdown; charset=utf-8'
    case '.json':
      return 'application/json'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}
