import { createHash, randomUUID } from 'crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'path'
import matter from 'gray-matter'
import { indexNote, removeNoteIndex } from '../indexer'
import { notifyVaultFilesChanged } from '../../ipc/events'
import type { KnowledgeMaintenanceItem } from '../ai/maintenance-queue'

export type ApplyFixAction = 'open_note' | 'create_target' | 'mark_done' | 'archive' | 'add_alias'
export type ApplyFixMode = 'preview' | 'apply' | 'undo'

export interface ApplyFixParams {
  vaultPath: string
  item: KnowledgeMaintenanceItem
  action: ApplyFixAction
  mode?: ApplyFixMode
  payload?: Record<string, unknown>
}

export interface ApplyFixPreview {
  filePath: string
  summary: string
  before: string | null
  after: string | null
  beforeHash?: string
  afterHash?: string
  createsFile: boolean
}

export interface ApplyFixResult {
  ok: boolean
  appliedAction: string
  resultMessage: string
  filePath?: string
  preview?: ApplyFixPreview
  undoToken?: string
  undoExpiresAt?: number
}

interface MaintenanceMutation {
  action: ApplyFixAction
  filePath: string
  absolutePath: string
  beforeExists: boolean
  beforeContent: string | null
  beforeHash?: string
  afterExists: boolean
  afterContent: string | null
  afterHash?: string
  resultMessage: string
}

interface MaintenanceUndoRecord extends MaintenanceMutation {
  token: string
  createdAt: number
  expiresAt: number
}

const UNDO_TTL_MS = 24 * 60 * 60 * 1000

export function applyMaintenanceFix(params: ApplyFixParams): ApplyFixResult {
  if (params.mode === 'undo') return undoMaintenanceFix(params)

  switch (params.action) {
    case 'open_note':
      return applyOpenNote(params)
    case 'create_target':
      return applyCreateTarget(params)
    case 'mark_done':
      return applyMarkDone(params)
    case 'archive':
      return applyArchive(params)
    case 'add_alias':
      return applyAddAlias(params)
    default:
      return {
        ok: false,
        appliedAction: params.action,
        resultMessage: `Unsupported maintenance action: ${params.action}`
      }
  }
}

function applyOpenNote(params: ApplyFixParams): ApplyFixResult {
  const absolutePath = resolveVaultFile(params.vaultPath, params.item.filePath)
  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      appliedAction: 'open_note',
      resultMessage: `File not found: ${params.item.filePath}`
    }
  }
  return {
    ok: true,
    appliedAction: 'open_note',
    resultMessage: `Open ${params.item.filePath}`,
    filePath: params.item.filePath
  }
}

function applyCreateTarget(params: ApplyFixParams): ApplyFixResult {
  const targetTitle = extractTargetTitle(params)
  if (!targetTitle) {
    return { ok: false, appliedAction: 'create_target', resultMessage: 'targetTitle is required' }
  }
  const safeTitle = targetTitle.replace(/[\\/:*?"<>|]/g, ' ').trim()
  if (!safeTitle) {
    return { ok: false, appliedAction: 'create_target', resultMessage: 'targetTitle must contain valid characters' }
  }
  const targetRelative = `${safeTitle}.md`
  const targetAbsolute = resolveVaultFile(params.vaultPath, targetRelative)
  if (existsSync(targetAbsolute)) {
    return {
      ok: false,
      appliedAction: 'create_target',
      resultMessage: `Note already exists: ${targetRelative}`,
      filePath: targetRelative
    }
  }
  return applyMutation(params, {
    action: 'create_target',
    filePath: targetRelative,
    absolutePath: targetAbsolute,
    beforeExists: false,
    beforeContent: null,
    afterExists: true,
    afterContent: `# ${safeTitle}\n\n`,
    afterHash: hashContent(`# ${safeTitle}\n\n`),
    resultMessage: `Created ${targetRelative}`
  })
}

function extractTargetTitle(params: ApplyFixParams): string {
  if (typeof params.payload?.targetTitle === 'string') return params.payload.targetTitle.trim()
  const actionMatch = params.item.action.match(/\[\[([^\]]+)\]\]/)
  if (actionMatch?.[1]) return actionMatch[1].trim()
  return params.item.detail.trim()
}

function applyMarkDone(params: ApplyFixParams): ApplyFixResult {
  const taskText = typeof params.payload?.taskText === 'string'
    ? (params.payload.taskText as string)
    : ''
  const absolutePath = resolveVaultFile(params.vaultPath, params.item.filePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, appliedAction: 'mark_done', resultMessage: `File not found: ${params.item.filePath}` }
  }
  const original = readFileSync(absolutePath, 'utf-8')
  let updated = original
  let changed = false
  if (taskText) {
    const escaped = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`^(\\s*-\\s*\\[\\s\\]\\s*)(${escaped})(\\s*)$`, 'm')
    updated = original.replace(pattern, (_match, prefix, body, suffix) => {
      changed = true
      return `${prefix.replace(/\[\s\]/, '[x]')}${body}${suffix}`
    })
  } else {
    updated = original.replace(/^(\s*-\s*)\[\s\](\s+.+)$/m, (match, prefix, rest) => {
      changed = true
      return `${prefix}[x]${rest}`
    })
  }
  if (!changed) {
    return { ok: false, appliedAction: 'mark_done', resultMessage: 'No open task found to mark done' }
  }
  return applyMutation(params, updateMutation('mark_done', params.item.filePath, absolutePath, original, updated, `Marked a task as done in ${params.item.filePath}`))
}

function applyArchive(params: ApplyFixParams): ApplyFixResult {
  const absolutePath = resolveVaultFile(params.vaultPath, params.item.filePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, appliedAction: 'archive', resultMessage: `File not found: ${params.item.filePath}` }
  }
  const original = readFileSync(absolutePath, 'utf-8')
  const parsed = matter(original)
  const frontmatter = parsed.data ?? {}
  if (frontmatter.archived === true) {
    return { ok: false, appliedAction: 'archive', resultMessage: 'Note is already archived' }
  }
  frontmatter.archived = true
  const next = matter.stringify(parsed.content, frontmatter)
  return applyMutation(params, updateMutation('archive', params.item.filePath, absolutePath, original, next, `Archived ${params.item.filePath}`))
}

function applyAddAlias(params: ApplyFixParams): ApplyFixResult {
  const aliasInput = typeof params.payload?.alias === 'string'
    ? (params.payload.alias as string).trim()
    : ''
  if (!aliasInput) {
    return { ok: false, appliedAction: 'add_alias', resultMessage: 'alias is required' }
  }
  const absolutePath = resolveVaultFile(params.vaultPath, params.item.filePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, appliedAction: 'add_alias', resultMessage: `File not found: ${params.item.filePath}` }
  }
  const original = readFileSync(absolutePath, 'utf-8')
  const parsed = matter(original)
  const frontmatter = parsed.data ?? {}
  const aliases: unknown = frontmatter.aliases
  const existing = Array.isArray(aliases)
    ? aliases.filter((value): value is string => typeof value === 'string')
    : typeof aliases === 'string'
      ? [aliases]
      : []
  if (existing.includes(aliasInput)) {
    return { ok: false, appliedAction: 'add_alias', resultMessage: `Alias already present: ${aliasInput}` }
  }
  frontmatter.aliases = [...existing, aliasInput]
  const next = matter.stringify(parsed.content, frontmatter)
  return applyMutation(params, updateMutation('add_alias', params.item.filePath, absolutePath, original, next, `Added alias "${aliasInput}" to ${params.item.filePath}`))
}

function applyMutation(params: ApplyFixParams, mutation: MaintenanceMutation): ApplyFixResult {
  if (params.mode === 'preview') {
    return {
      ok: true,
      appliedAction: mutation.action,
      resultMessage: mutation.resultMessage,
      filePath: mutation.filePath,
      preview: mutationPreview(mutation)
    }
  }

  const expectedBeforeHash = typeof params.payload?.expectedBeforeHash === 'string'
    ? params.payload.expectedBeforeHash
    : undefined
  if (expectedBeforeHash && mutation.beforeHash !== expectedBeforeHash) {
    return {
      ok: false,
      appliedAction: mutation.action,
      resultMessage: `File changed since preview: ${mutation.filePath}`,
      filePath: mutation.filePath
    }
  }

  applyMutationToDisk(params.vaultPath, mutation)
  const undo = writeUndoRecord(params.vaultPath, mutation)
  notifyVaultFilesChanged([mutation.absolutePath])
  return {
    ok: true,
    appliedAction: mutation.action,
    resultMessage: mutation.resultMessage,
    filePath: mutation.filePath,
    undoToken: undo.token,
    undoExpiresAt: undo.expiresAt
  }
}

function undoMaintenanceFix(params: ApplyFixParams): ApplyFixResult {
  const token = typeof params.payload?.undoToken === 'string' ? params.payload.undoToken : ''
  if (!token) return { ok: false, appliedAction: params.action, resultMessage: 'undoToken is required' }

  let recordPath: string
  try {
    recordPath = undoRecordPath(params.vaultPath, token)
  } catch {
    return { ok: false, appliedAction: params.action, resultMessage: 'Invalid undo token' }
  }
  if (!existsSync(recordPath)) {
    return { ok: false, appliedAction: params.action, resultMessage: 'Undo record not found or expired' }
  }

  const record = JSON.parse(readFileSync(recordPath, 'utf-8')) as MaintenanceUndoRecord
  if (Date.now() > record.expiresAt) {
    try { unlinkSync(recordPath) } catch { /* best effort */ }
    return { ok: false, appliedAction: record.action, resultMessage: 'Undo record not found or expired', filePath: record.filePath }
  }
  const absolutePath = resolveVaultFile(params.vaultPath, record.filePath)
  const currentExists = existsSync(absolutePath)
  const currentContent = currentExists ? readFileSync(absolutePath, 'utf-8') : null
  const currentHash = currentContent === null ? undefined : hashContent(currentContent)
  if (record.afterHash && currentHash !== record.afterHash) {
    return {
      ok: false,
      appliedAction: record.action,
      resultMessage: `Cannot undo because the file changed after the fix: ${record.filePath}`,
      filePath: record.filePath
    }
  }

  if (record.beforeExists) {
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, record.beforeContent ?? '', 'utf-8')
    try { indexNote(params.vaultPath, absolutePath) } catch { /* best effort */ }
  } else if (currentExists) {
    moveToVaultTrash(params.vaultPath, absolutePath)
    try { removeNoteIndex(params.vaultPath, absolutePath) } catch { /* best effort */ }
  }

  try { unlinkSync(recordPath) } catch { /* best effort */ }
  notifyVaultFilesChanged([absolutePath])
  return {
    ok: true,
    appliedAction: record.action,
    resultMessage: `Undid ${record.action} in ${record.filePath}`,
    filePath: record.filePath
  }
}

function applyMutationToDisk(vaultPath: string, mutation: MaintenanceMutation): void {
  if (!mutation.afterExists || mutation.afterContent === null) return
  mkdirSync(dirname(mutation.absolutePath), { recursive: true })
  writeFileSync(mutation.absolutePath, mutation.afterContent, 'utf-8')
  try { indexNote(vaultPath, mutation.absolutePath) } catch { /* best effort */ }
}

function updateMutation(action: ApplyFixAction, filePath: string, absolutePath: string, before: string, after: string, resultMessage: string): MaintenanceMutation {
  return {
    action,
    filePath,
    absolutePath,
    beforeExists: true,
    beforeContent: before,
    beforeHash: hashContent(before),
    afterExists: true,
    afterContent: after,
    afterHash: hashContent(after),
    resultMessage
  }
}

function mutationPreview(mutation: MaintenanceMutation): ApplyFixPreview {
  return {
    filePath: mutation.filePath,
    summary: mutation.resultMessage,
    before: mutation.beforeContent,
    after: mutation.afterContent,
    beforeHash: mutation.beforeHash,
    afterHash: mutation.afterHash,
    createsFile: !mutation.beforeExists && mutation.afterExists
  }
}

function writeUndoRecord(vaultPath: string, mutation: MaintenanceMutation): { token: string; expiresAt: number } {
  const token = randomUUID()
  const createdAt = Date.now()
  const expiresAt = createdAt + UNDO_TTL_MS
  const record: MaintenanceUndoRecord = { ...mutation, token, createdAt, expiresAt }
  mkdirSync(undoDir(vaultPath), { recursive: true })
  writeFileSync(undoRecordPath(vaultPath, token), JSON.stringify(record), 'utf-8')
  return { token, expiresAt }
}

function undoDir(vaultPath: string): string {
  return join(vaultPath, '.nexusky', 'maintenance-undo')
}

function undoRecordPath(vaultPath: string, token: string): string {
  if (!/^[\da-f-]{36}$/i.test(token)) throw new Error('Invalid undo token')
  return assertPathInsideVaultSync(join(undoDir(vaultPath), `${token}.json`), undoDir(vaultPath))
}

function moveToVaultTrash(vaultPath: string, absolutePath: string): void {
  const trashDir = join(vaultPath, '.trash')
  mkdirSync(trashDir, { recursive: true })
  const timestamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  const trashPath = join(trashDir, `${timestamp}_${rand}_${basename(absolutePath)}`)
  renameSync(absolutePath, trashPath)
  const originalPath = relative(vaultPath, absolutePath).replace(/\\/g, '/')
  writeFileSync(`${trashPath}.json`, JSON.stringify({ originalPath, deletedAt: timestamp }), 'utf-8')
}

function resolveVaultFile(vaultPath: string, filePath: string): string {
  return assertPathInsideVaultSync(resolve(vaultPath, filePath), vaultPath)
}

function assertPathInsideVaultSync(filePath: string, vaultPath: string): string {
  const requested = normalize(resolve(filePath))
  const normalizedVault = normalize(resolve(vaultPath))
  if (!isPathInside(requested, normalizedVault)) throw new Error('Path is outside the current vault')
  const realFile = realPathSafeSync(requested)
  const realVault = realPathSafeSync(normalizedVault)
  if (!isPathInside(realFile, realVault)) throw new Error('Path escapes the current vault after resolving symlinks')
  return realFile
}

function realPathSafeSync(filePath: string): string {
  const existing = resolveExistingAncestorSync(filePath)
  const suffix = relative(existing, normalize(resolve(filePath)))
  try {
    const real = realpathSync.native(existing)
    return suffix ? normalize(resolve(real, suffix)) : real
  } catch {
    return existing
  }
}

function resolveExistingAncestorSync(filePath: string): string {
  let current = normalize(resolve(filePath))
  while (true) {
    try {
      lstatSync(current)
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

function isPathInside(filePath: string, vaultPath: string): boolean {
  const relPath = relative(vaultPath, filePath)
  return relPath === '' || (!relPath.startsWith('..') && !isAbsolute(relPath))
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}
