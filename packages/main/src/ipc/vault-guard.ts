import { realpath } from 'fs/promises'
import { normalize, resolve } from 'path'
import { store } from '../services/store'
import { assertPathInsideVault } from './file-path'

async function canonicalPath(path: string): Promise<string> {
  try {
    return normalize(await realpath(path))
  } catch {
    return normalize(resolve(path))
  }
}

export async function requireCurrentVaultPath(providedVaultPath?: string | null): Promise<string> {
  const currentVaultPath = store.get('vaultPath')
  if (typeof currentVaultPath !== 'string' || currentVaultPath.trim().length === 0) {
    throw new Error('未打开知识库')
  }

  if (providedVaultPath) {
    const current = await canonicalPath(currentVaultPath)
    const provided = await canonicalPath(providedVaultPath)
    if (current !== provided) {
      throw new Error('请求的笔记空间不是当前打开的笔记空间')
    }
  }

  return currentVaultPath
}

export async function assertPathInsideCurrentVault(filePath: string, providedVaultPath?: string | null): Promise<{ vaultPath: string; filePath: string }> {
  const vaultPath = await requireCurrentVaultPath(providedVaultPath)
  return {
    vaultPath,
    filePath: await assertPathInsideVault(filePath, vaultPath),
  }
}
