import { isAbsolute, normalize, relative, resolve } from 'path'

export function isPathInsideVault(filePath: string, vaultPath?: string): boolean {
  if (!vaultPath) return true
  const normalizedFile = normalize(resolve(filePath))
  const normalizedVault = normalize(resolve(vaultPath))
  const relPath = relative(normalizedVault, normalizedFile)
  return relPath === '' || (!relPath.startsWith('..') && !isAbsolute(relPath))
}
