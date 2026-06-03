import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { indexNote, removeNoteIndex } from './indexer'
import { moveFileToVaultTrash } from './version-recovery'

export interface VaultFileMutation {
  filePath: string
  absolutePath: string
  beforeExists: boolean
  beforeContent: string | null
  beforeHash?: string
  afterExists: boolean
  afterContent: string | null
  afterHash?: string
}

export interface VaultFileMutationPreview {
  filePath: string
  summary: string
  before: string | null
  after: string | null
  beforeHash?: string
  afterHash?: string
  createsFile: boolean
  deletesFile: boolean
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function createVaultFileCreateMutation(params: {
  filePath: string
  absolutePath: string
  afterContent: string
}): VaultFileMutation {
  return {
    filePath: params.filePath,
    absolutePath: params.absolutePath,
    beforeExists: false,
    beforeContent: null,
    afterExists: true,
    afterContent: params.afterContent,
    afterHash: hashContent(params.afterContent)
  }
}

export function createVaultFileUpdateMutation(params: {
  filePath: string
  absolutePath: string
  beforeContent: string
  afterContent: string
}): VaultFileMutation {
  return {
    filePath: params.filePath,
    absolutePath: params.absolutePath,
    beforeExists: true,
    beforeContent: params.beforeContent,
    beforeHash: hashContent(params.beforeContent),
    afterExists: true,
    afterContent: params.afterContent,
    afterHash: hashContent(params.afterContent)
  }
}

export function previewVaultFileMutation(mutation: VaultFileMutation, summary: string): VaultFileMutationPreview {
  return {
    filePath: mutation.filePath,
    summary,
    before: mutation.beforeContent,
    after: mutation.afterContent,
    beforeHash: mutation.beforeHash,
    afterHash: mutation.afterHash,
    createsFile: !mutation.beforeExists && mutation.afterExists,
    deletesFile: mutation.beforeExists && !mutation.afterExists
  }
}

export function applyVaultFileMutation(vaultPath: string, mutation: VaultFileMutation): void {
  if (mutation.afterExists && mutation.afterContent !== null) {
    mkdirSync(dirname(mutation.absolutePath), { recursive: true })
    writeFileSync(mutation.absolutePath, mutation.afterContent, 'utf-8')
    safeIndex(vaultPath, mutation.absolutePath)
    return
  }

  if (mutation.beforeExists && existsSync(mutation.absolutePath)) {
    moveFileToVaultTrash(vaultPath, mutation.absolutePath, 'vault_mutation_delete')
    safeRemoveIndex(vaultPath, mutation.absolutePath)
  }
}

export function restoreVaultFileMutationBeforeState(vaultPath: string, mutation: VaultFileMutation): void {
  const currentExists = existsSync(mutation.absolutePath)
  if (mutation.beforeExists) {
    mkdirSync(dirname(mutation.absolutePath), { recursive: true })
    writeFileSync(mutation.absolutePath, mutation.beforeContent ?? '', 'utf-8')
    safeIndex(vaultPath, mutation.absolutePath)
    return
  }

  if (currentExists) {
    moveFileToVaultTrash(vaultPath, mutation.absolutePath, 'vault_mutation_undo_create')
    safeRemoveIndex(vaultPath, mutation.absolutePath)
  }
}

function safeIndex(vaultPath: string, absolutePath: string): void {
  if (!absolutePath.endsWith('.md')) return
  try { indexNote(vaultPath, absolutePath) } catch { /* best effort */ }
}

function safeRemoveIndex(vaultPath: string, absolutePath: string): void {
  if (!absolutePath.endsWith('.md')) return
  try { removeNoteIndex(vaultPath, absolutePath) } catch { /* best effort */ }
}
