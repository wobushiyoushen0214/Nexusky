import { isAbsolute, normalize, relative, resolve, dirname } from 'path'
import { lstat, realpath } from 'fs/promises'

export function isPathInsideVault(filePath: string, vaultPath?: string): boolean {
  if (!vaultPath) return true
  const normalizedFile = normalize(resolve(filePath))
  const normalizedVault = normalize(resolve(vaultPath))
  const relPath = relative(normalizedVault, normalizedFile)
  return relPath === '' || (!relPath.startsWith('..') && !isAbsolute(relPath))
}

async function resolveExistingAncestor(filePath: string): Promise<string> {
  let current = normalize(resolve(filePath))
  while (true) {
    try {
      await lstat(current)
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

async function realPathSafe(filePath: string): Promise<string> {
  // Resolve symlinks for the deepest existing ancestor and re-attach any
  // not-yet-created suffix so we can validate "future writes" against
  // their real on-disk parent.
  const existing = await resolveExistingAncestor(filePath)
  const suffix = relative(existing, normalize(resolve(filePath)))
  try {
    const real = await realpath(existing)
    return suffix ? normalize(resolve(real, suffix)) : real
  } catch {
    return existing
  }
}

/**
 * Asynchronously assert that filePath sits inside vaultPath even after
 * following symlinks at every existing path segment. Resolves to the
 * canonical absolute path on success; throws otherwise.
 */
export async function assertPathInsideVault(filePath: string, vaultPath?: string): Promise<string> {
  const requested = normalize(resolve(filePath))
  if (!vaultPath) return requested
  if (!isPathInsideVault(requested, vaultPath)) {
    throw new Error('路径不在当前笔记空间内')
  }
  const realFile = await realPathSafe(requested)
  const realVault = await realPathSafe(vaultPath)
  if (!isPathInsideVault(realFile, realVault)) {
    throw new Error('路径解析后越出笔记空间（可能存在符号链接）')
  }
  return realFile
}
