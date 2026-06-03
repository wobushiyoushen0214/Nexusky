import { existsSync, readFileSync, realpathSync } from 'fs'
import { relative, resolve } from 'path'
import { notifyVaultFilesChanged } from '../ipc/events'
import { assertPathInsideVault } from '../ipc/file-path'
import {
  applyVaultFileMutation,
  createVaultFileCreateMutation,
  createVaultFileUpdateMutation,
  hashContent
} from './vault-mutation'

export interface VaultContentReadResult {
  filePath: string
  content: string
  hash: string
}

export interface ApplyVaultContentMutationParams {
  vaultPath: string
  filePath: string
  content: string
  expectedBeforeHash?: string
  allowCreate?: boolean
}

export interface ApplyVaultContentMutationResult {
  success: boolean
  filePath?: string
  beforeHash?: string
  afterHash?: string
  created?: boolean
  error?: string
}

function realPathOrResolved(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function vaultRelativePath(vaultPath: string, absolutePath: string): string {
  return relative(realPathOrResolved(vaultPath), absolutePath).replace(/\\/g, '/')
}

export async function readVaultFileWithHash(vaultPath: string, filePath: string): Promise<VaultContentReadResult> {
  const absolutePath = await assertPathInsideVault(filePath, vaultPath)
  const content = readFileSync(absolutePath, 'utf-8')
  return {
    filePath: vaultRelativePath(vaultPath, absolutePath),
    content,
    hash: hashContent(content)
  }
}

export async function applyVaultContentMutation(params: ApplyVaultContentMutationParams): Promise<ApplyVaultContentMutationResult> {
  if (!params.filePath || typeof params.filePath !== 'string') {
    return { success: false, error: '缺少目标文件路径' }
  }
  if (typeof params.content !== 'string') {
    return { success: false, error: '写入内容无效' }
  }

  const absolutePath = await assertPathInsideVault(params.filePath, params.vaultPath)
  const filePath = vaultRelativePath(params.vaultPath, absolutePath)
  const beforeExists = existsSync(absolutePath)

  if (!beforeExists) {
    if (!params.allowCreate) {
      return { success: false, filePath, error: `目标文件不存在：${filePath}` }
    }
    if (params.expectedBeforeHash) {
      return { success: false, filePath, error: `目标文件不存在：${filePath}` }
    }

    const mutation = createVaultFileCreateMutation({
      filePath,
      absolutePath,
      afterContent: params.content
    })
    applyVaultFileMutation(params.vaultPath, mutation)
    notifyVaultFilesChanged([absolutePath])
    return {
      success: true,
      filePath,
      afterHash: mutation.afterHash,
      created: true
    }
  }

  if (!params.expectedBeforeHash) {
    return { success: false, filePath, error: '缺少预览时的文件 hash，请重新生成修改方案' }
  }

  const beforeContent = readFileSync(absolutePath, 'utf-8')
  const beforeHash = hashContent(beforeContent)
  if (beforeHash !== params.expectedBeforeHash) {
    return { success: false, filePath, beforeHash, error: `预览后文件已变化：${filePath}` }
  }

  const mutation = createVaultFileUpdateMutation({
    filePath,
    absolutePath,
    beforeContent,
    afterContent: params.content
  })
  applyVaultFileMutation(params.vaultPath, mutation)
  notifyVaultFilesChanged([absolutePath])

  return {
    success: true,
    filePath,
    beforeHash: mutation.beforeHash,
    afterHash: mutation.afterHash,
    created: false
  }
}
