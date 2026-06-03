import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path'
import { createHash } from 'crypto'
import { notifyVaultFilesChanged } from '../ipc/events'
import { indexNote, removeNoteIndex } from './indexer'
import { applyVaultFileMutation, createVaultFileUpdateMutation } from './vault-mutation'

export type FileOperationRisk = 'move' | 'delete'
export type FileOperationSource = 'file_ipc' | 'agent' | 'rollback'

export interface FileOperationAuditEntry {
  id: string
  kind: 'move' | 'rename' | 'delete'
  risk: FileOperationRisk
  source: FileOperationSource
  sourcePath: string
  targetPath?: string
  trashPath?: string
  hash?: string
  reason?: string
  timestamp: number
}

export interface FileOperationResult {
  ok: boolean
  error?: string
  sourcePath: string
  targetPath?: string
  trashPath?: string
  sourceRelPath?: string
  targetRelPath?: string
  trashRelPath?: string
  hash?: string
  audit?: FileOperationAuditEntry
}

export interface WikilinkUpdate {
  relPath: string
  absPath: string
  previousContent: string
  nextContent: string
}

export interface RenameFileOperationResult extends FileOperationResult {
  linkUpdates: WikilinkUpdate[]
  afterHashes: { filePath: string; hash: string }[]
}

function operationId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function toVaultRelPath(vaultPath: string, absolutePath: string): string {
  const direct = relative(vaultPath, absolutePath)
  if (direct === '' || (!direct.startsWith('..') && !isAbsolute(direct))) {
    return direct.replace(/\\/g, '/')
  }
  return relative(realPathOrResolved(vaultPath), realPathOrResolved(absolutePath)).replace(/\\/g, '/')
}

function realPathOrResolved(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function canonicalPathForCheck(path: string): string {
  const requested = resolve(path)
  let existingAncestor = requested
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor)
    if (parent === existingAncestor) break
    existingAncestor = parent
  }
  const suffix = relative(existingAncestor, requested)
  const canonicalAncestor = realPathOrResolved(existingAncestor)
  return suffix ? resolve(canonicalAncestor, suffix) : canonicalAncestor
}

function isInsidePath(parentPath: string, childPath: string): boolean {
  const relPath = relative(parentPath, childPath)
  return relPath === '' || (!relPath.startsWith('..') && !isAbsolute(relPath))
}

function assertFileOperationPath(filePath: string, vaultPath: string): string {
  const requested = resolve(filePath)
  const vault = resolve(vaultPath)
  if (!isInsidePath(vault, requested)) {
    throw new Error('路径不在当前笔记空间内')
  }

  const canonicalVault = realPathOrResolved(vault)
  const canonicalFile = canonicalPathForCheck(requested)
  if (!isInsidePath(canonicalVault, canonicalFile)) {
    throw new Error('路径解析后越出笔记空间（可能存在符号链接）')
  }

  return requested
}

function contentHash(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  try {
    return createHash('sha256').update(readFileSync(path, 'utf-8')).digest('hex')
  } catch {
    return undefined
  }
}

function markdownFilesUnder(root: string): string[] {
  const result: string[] = []
  if (!existsSync(root)) return result
  const visit = (path: string) => {
    const entries = readdirSync(path, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.trash' || entry.name === '.nexusky' || entry.name === 'node_modules') continue
      const full = join(path, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) result.push(full)
    }
  }
  visit(root)
  return result
}

function affectedMarkdownFiles(path: string): string[] {
  if (!existsSync(path)) return []
  if (path.toLowerCase().endsWith('.md')) return [path]
  return markdownFilesUnder(path)
}

function removeIndexesForPath(vaultPath: string, path: string): void {
  for (const filePath of affectedMarkdownFiles(path)) {
    try { removeNoteIndex(vaultPath, filePath) } catch {}
  }
}

function indexPath(vaultPath: string, path: string): void {
  for (const filePath of affectedMarkdownFiles(path)) {
    try { indexNote(vaultPath, filePath) } catch {}
  }
}

function writeAudit(vaultPath: string, entry: FileOperationAuditEntry): void {
  try {
    const dir = join(vaultPath, '.nexusky')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'file-operations.jsonl'), `${JSON.stringify(entry)}\n`, 'utf-8')
  } catch {
    // Audit is best-effort; the file operation already used trash/history guards.
  }
}

function auditEntry(params: {
  kind: 'move' | 'rename' | 'delete'
  risk: FileOperationRisk
  source: FileOperationSource
  sourceRelPath: string
  targetRelPath?: string
  trashRelPath?: string
  hash?: string
  reason?: string
}): FileOperationAuditEntry {
  return {
    id: operationId(),
    kind: params.kind,
    risk: params.risk,
    source: params.source,
    sourcePath: params.sourceRelPath,
    targetPath: params.targetRelPath,
    trashPath: params.trashRelPath,
    hash: params.hash,
    reason: params.reason,
    timestamp: Date.now()
  }
}

export async function moveVaultPath(params: {
  vaultPath: string
  sourcePath: string
  targetPath: string
  kind?: 'move' | 'rename'
  source?: FileOperationSource
  reason?: string
  updateIndex?: boolean
}): Promise<FileOperationResult> {
  const vaultPath = resolve(params.vaultPath)
  const sourcePath = assertFileOperationPath(params.sourcePath, vaultPath)
  const targetPath = assertFileOperationPath(params.targetPath, vaultPath)
  const sourceRelPath = toVaultRelPath(vaultPath, sourcePath)
  const targetRelPath = toVaultRelPath(vaultPath, targetPath)

  if (!existsSync(sourcePath)) {
    return { ok: false, error: 'file_not_found', sourcePath, targetPath, sourceRelPath, targetRelPath }
  }
  if (existsSync(targetPath)) {
    return { ok: false, error: 'target_file_exists', sourcePath, targetPath, sourceRelPath, targetRelPath }
  }

  const hash = contentHash(sourcePath)
  mkdirSync(dirname(targetPath), { recursive: true })
  if (params.updateIndex !== false) removeIndexesForPath(vaultPath, sourcePath)
  renameSync(sourcePath, targetPath)
  if (params.updateIndex !== false) indexPath(vaultPath, targetPath)

  const audit = auditEntry({
    kind: params.kind || 'move',
    risk: 'move',
    source: params.source || 'file_ipc',
    sourceRelPath,
    targetRelPath,
    hash,
    reason: params.reason
  })
  writeAudit(vaultPath, audit)
  notifyVaultFilesChanged([sourcePath, targetPath])

  return {
    ok: true,
    sourcePath,
    targetPath,
    sourceRelPath,
    targetRelPath,
    hash,
    audit
  }
}

export async function deleteVaultPath(params: {
  vaultPath: string
  filePath: string
  source?: FileOperationSource
  reason?: string
  updateIndex?: boolean
}): Promise<FileOperationResult> {
  const vaultPath = resolve(params.vaultPath)
  const sourcePath = assertFileOperationPath(params.filePath, vaultPath)
  const sourceRelPath = toVaultRelPath(vaultPath, sourcePath)
  if (!existsSync(sourcePath)) {
    return { ok: false, error: 'file_not_found', sourcePath, sourceRelPath }
  }

  const trashDir = join(vaultPath, '.trash')
  mkdirSync(trashDir, { recursive: true })
  const timestamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  const trashPath = join(trashDir, `${timestamp}_${rand}_${basename(sourcePath)}`)
  const trashRelPath = toVaultRelPath(vaultPath, trashPath)
  const hash = contentHash(sourcePath)

  if (params.updateIndex !== false) removeIndexesForPath(vaultPath, sourcePath)
  renameSync(sourcePath, trashPath)
  writeFileSync(`${trashPath}.json`, JSON.stringify({
    originalPath: sourceRelPath,
    deletedAt: timestamp,
    reason: params.reason || 'vault_file_delete',
    risk: 'delete',
    source: params.source || 'file_ipc',
    hash
  }), 'utf-8')

  const audit = auditEntry({
    kind: 'delete',
    risk: 'delete',
    source: params.source || 'file_ipc',
    sourceRelPath,
    trashRelPath,
    hash,
    reason: params.reason || 'vault_file_delete'
  })
  writeAudit(vaultPath, audit)
  notifyVaultFilesChanged([sourcePath])

  return {
    ok: true,
    sourcePath,
    trashPath,
    sourceRelPath,
    trashRelPath,
    hash,
    audit
  }
}

export function resolveVaultPath(vaultPath: string, relPath: string): string | null {
  const baseVaultPath = resolve(vaultPath)
  const canonicalVaultPath = realPathOrResolved(baseVaultPath)
  const slashNormalized = relPath.replace(/\\/g, '/')
  if (isAbsolute(slashNormalized)) {
    const absolutePath = resolve(slashNormalized)
    if (!isInsidePath(baseVaultPath, absolutePath)) return null
    if (!isInsidePath(canonicalVaultPath, canonicalPathForCheck(absolutePath))) return null
    return absolutePath
  }
  const normalized = slashNormalized.replace(/^\/+/, '')
  const full = resolve(join(baseVaultPath, normalized))
  if (!isInsidePath(baseVaultPath, full)) return null
  if (!isInsidePath(canonicalVaultPath, canonicalPathForCheck(full))) return null
  return full
}

export function collectWikilinkUpdates(vaultPath: string, sourceRel: string, targetRel: string): WikilinkUpdate[] {
  const baseVaultPath = resolve(vaultPath)
  const oldTitle = basename(sourceRel, extname(sourceRel))
  const oldPath = sourceRel.replace(/\.md$/i, '')
  const newTitle = basename(targetRel, extname(targetRel))
  const updates: WikilinkUpdate[] = []
  for (const absPath of markdownFilesUnder(baseVaultPath)) {
    const previousContent = readFileSync(absPath, 'utf-8')
    const nextContent = previousContent.replace(/\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g, (match, rawTarget, heading = '', alias = '') => {
      const normalized = normalizeWikiTarget(rawTarget)
      if (normalized !== oldTitle && normalized !== oldPath) return match
      return `[[${newTitle}${heading}${alias}]]`
    })
    if (nextContent !== previousContent) {
      updates.push({
        relPath: toVaultRelPath(baseVaultPath, absPath),
        absPath,
        previousContent,
        nextContent
      })
    }
  }
  return updates
}

export async function renameVaultMarkdownWithLinkUpdates(params: {
  vaultPath: string
  sourcePath: string
  targetPath: string
  source?: FileOperationSource
  reason?: string
}): Promise<RenameFileOperationResult> {
  const vaultPath = resolve(params.vaultPath)
  const sourcePath = assertFileOperationPath(params.sourcePath, vaultPath)
  const targetPath = assertFileOperationPath(params.targetPath, vaultPath)
  const sourceRelPath = toVaultRelPath(vaultPath, sourcePath)
  const targetRelPath = toVaultRelPath(vaultPath, targetPath)
  const linkUpdates = sourcePath.toLowerCase().endsWith('.md') && targetPath.toLowerCase().endsWith('.md')
    ? collectWikilinkUpdates(vaultPath, sourceRelPath, targetRelPath)
    : []
  const move = await moveVaultPath({
    vaultPath,
    sourcePath,
    targetPath,
    kind: 'rename',
    source: params.source || 'file_ipc',
    reason: params.reason || 'vault_file_rename',
    updateIndex: true
  })
  if (!move.ok) {
    return { ...move, linkUpdates, afterHashes: [] }
  }

  const afterHashes: { filePath: string; hash: string }[] = []
  for (const update of linkUpdates) {
    const writePath = update.relPath === sourceRelPath ? targetPath : update.absPath
    const writeRelPath = update.relPath === sourceRelPath ? targetRelPath : update.relPath
    const mutation = createVaultFileUpdateMutation({
      filePath: writeRelPath,
      absolutePath: writePath,
      beforeContent: update.previousContent,
      afterContent: update.nextContent
    })
    applyVaultFileMutation(vaultPath, mutation)
    afterHashes.push({
      filePath: writeRelPath,
      hash: mutation.afterHash || createHash('sha256').update(update.nextContent).digest('hex')
    })
  }
  if (linkUpdates.length > 0) {
    notifyVaultFilesChanged(linkUpdates.map((update) => update.relPath === sourceRelPath ? targetPath : update.absPath))
  }

  return {
    ...move,
    linkUpdates,
    afterHashes
  }
}

function normalizeWikiTarget(value: string): string {
  const trimmed = value.trim().replace(/\\/g, '/').replace(/\.md$/i, '')
  return basename(trimmed, extname(trimmed)) || trimmed
}
