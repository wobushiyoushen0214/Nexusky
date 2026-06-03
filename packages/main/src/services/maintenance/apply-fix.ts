import { randomUUID } from 'crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'path'
import matter from 'gray-matter'
import { notifyVaultFilesChanged } from '../../ipc/events'
import type { KnowledgeMaintenanceItem } from '../ai/maintenance-queue'
import type { AppLanguage } from '@shared/types/ipc'
import { applyVaultFileMutation, createVaultFileCreateMutation, createVaultFileUpdateMutation, hashContent, previewVaultFileMutation, restoreVaultFileMutationBeforeState, type VaultFileMutation } from '../vault-mutation'

export type ApplyFixAction = 'open_note' | 'create_target' | 'mark_done' | 'archive' | 'add_alias'
export type ApplyFixMode = 'preview' | 'apply' | 'undo'

export interface ApplyFixParams {
  vaultPath: string
  item: KnowledgeMaintenanceItem
  action: ApplyFixAction
  mode?: ApplyFixMode
  payload?: Record<string, unknown>
  language?: AppLanguage
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

interface MaintenanceMutation extends VaultFileMutation {
  action: ApplyFixAction
  resultMessage: string
}

interface MaintenanceUndoRecord extends MaintenanceMutation {
  token: string
  createdAt: number
  expiresAt: number
}

const UNDO_TTL_MS = 24 * 60 * 60 * 1000

function getApplyFixLanguage(params: ApplyFixParams): AppLanguage {
  return params.language ?? 'en'
}

function getActionLabel(action: ApplyFixAction, language: AppLanguage): string {
  if (language === 'en') return action
  const labels: Record<ApplyFixAction, string> = {
    open_note: '打开笔记',
    create_target: '新建目标',
    mark_done: '标记完成',
    archive: '归档',
    add_alias: '添加别名'
  }
  return labels[action]
}

function createApplyFixCopy(language: AppLanguage = 'en') {
  const zh = language !== 'en'
  return {
    unsupportedAction: (action: string) => zh ? `不支持的维护操作：${action}` : `Unsupported maintenance action: ${action}`,
    fileNotFound: (filePath: string) => zh ? `找不到文件：${filePath}` : `File not found: ${filePath}`,
    openNote: (filePath: string) => zh ? `已打开 ${filePath}` : `Open ${filePath}`,
    targetRequired: () => zh ? '需要提供 targetTitle' : 'targetTitle is required',
    targetInvalid: () => zh ? 'targetTitle 必须包含有效字符' : 'targetTitle must contain valid characters',
    targetExists: (filePath: string) => zh ? `笔记已存在：${filePath}` : `Note already exists: ${filePath}`,
    created: (filePath: string) => zh ? `已创建 ${filePath}` : `Created ${filePath}`,
    noOpenTask: () => zh ? '没有找到可标记完成的未完成任务' : 'No open task found to mark done',
    markedDone: (filePath: string) => zh ? `已在 ${filePath} 中标记一项任务为完成` : `Marked a task as done in ${filePath}`,
    alreadyArchived: () => zh ? '这篇笔记已经归档' : 'Note is already archived',
    archived: (filePath: string) => zh ? `已归档 ${filePath}` : `Archived ${filePath}`,
    aliasRequired: () => zh ? '需要提供 alias' : 'alias is required',
    aliasExists: (alias: string) => zh ? `别名已存在：${alias}` : `Alias already present: ${alias}`,
    aliasAdded: (alias: string, filePath: string) => zh ? `已将别名“${alias}”添加到 ${filePath}` : `Added alias "${alias}" to ${filePath}`,
    fileChangedSincePreview: (filePath: string) => zh ? `预览后文件已变化：${filePath}` : `File changed since preview: ${filePath}`,
    undoTokenRequired: () => zh ? '需要提供 undoToken' : 'undoToken is required',
    invalidUndoToken: () => zh ? '无效的撤销令牌' : 'Invalid undo token',
    undoRecordMissing: () => zh ? '撤销记录不存在或已过期' : 'Undo record not found or expired',
    cannotUndoChanged: (filePath: string) => zh ? `无法撤销，因为修复后文件又发生了变化：${filePath}` : `Cannot undo because the file changed after the fix: ${filePath}`,
    undone: (action: ApplyFixAction, filePath: string) => zh ? `已撤销 ${getActionLabel(action, language)}：${filePath}` : `Undid ${action} in ${filePath}`,
    pathOutsideVault: () => zh ? '路径不在当前 vault 内' : 'Path is outside the current vault',
    pathEscapesVault: () => zh ? '路径解析符号链接后逃离当前 vault' : 'Path escapes the current vault after resolving symlinks'
  }
}

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
        resultMessage: createApplyFixCopy(getApplyFixLanguage(params)).unsupportedAction(params.action)
      }
  }
}

function applyOpenNote(params: ApplyFixParams): ApplyFixResult {
  const copy = createApplyFixCopy(getApplyFixLanguage(params))
  const absolutePath = resolveVaultFile(params.vaultPath, params.item.filePath, getApplyFixLanguage(params))
  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      appliedAction: 'open_note',
      resultMessage: copy.fileNotFound(params.item.filePath)
    }
  }
  return {
    ok: true,
    appliedAction: 'open_note',
    resultMessage: copy.openNote(params.item.filePath),
    filePath: params.item.filePath
  }
}

function applyCreateTarget(params: ApplyFixParams): ApplyFixResult {
  const copy = createApplyFixCopy(getApplyFixLanguage(params))
  const targetTitle = extractTargetTitle(params)
  if (!targetTitle) {
    return { ok: false, appliedAction: 'create_target', resultMessage: copy.targetRequired() }
  }
  const safeTitle = targetTitle.replace(/[\\/:*?"<>|]/g, ' ').trim()
  if (!safeTitle) {
    return { ok: false, appliedAction: 'create_target', resultMessage: copy.targetInvalid() }
  }
  const targetRelative = `${safeTitle}.md`
  const targetAbsolute = resolveVaultFile(params.vaultPath, targetRelative, getApplyFixLanguage(params))
  if (existsSync(targetAbsolute)) {
    return {
      ok: false,
      appliedAction: 'create_target',
      resultMessage: copy.targetExists(targetRelative),
      filePath: targetRelative
    }
  }
  return applyMutation(params, {
    action: 'create_target',
    resultMessage: copy.created(targetRelative),
    ...createVaultFileCreateMutation({
      filePath: targetRelative,
      absolutePath: targetAbsolute,
      afterContent: `# ${safeTitle}\n\n`
    })
  })
}

function extractTargetTitle(params: ApplyFixParams): string {
  if (typeof params.payload?.targetTitle === 'string') return params.payload.targetTitle.trim()
  const actionMatch = params.item.action.match(/\[\[([^\]]+)\]\]/)
  if (actionMatch?.[1]) return actionMatch[1].trim()
  return params.item.detail.trim()
}

function applyMarkDone(params: ApplyFixParams): ApplyFixResult {
  const copy = createApplyFixCopy(getApplyFixLanguage(params))
  const taskText = typeof params.payload?.taskText === 'string'
    ? (params.payload.taskText as string)
    : ''
  const absolutePath = resolveVaultFile(params.vaultPath, params.item.filePath, getApplyFixLanguage(params))
  if (!existsSync(absolutePath)) {
    return { ok: false, appliedAction: 'mark_done', resultMessage: copy.fileNotFound(params.item.filePath) }
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
    return { ok: false, appliedAction: 'mark_done', resultMessage: copy.noOpenTask() }
  }
  return applyMutation(params, updateMutation('mark_done', params.item.filePath, absolutePath, original, updated, copy.markedDone(params.item.filePath)))
}

function applyArchive(params: ApplyFixParams): ApplyFixResult {
  const copy = createApplyFixCopy(getApplyFixLanguage(params))
  const absolutePath = resolveVaultFile(params.vaultPath, params.item.filePath, getApplyFixLanguage(params))
  if (!existsSync(absolutePath)) {
    return { ok: false, appliedAction: 'archive', resultMessage: copy.fileNotFound(params.item.filePath) }
  }
  const original = readFileSync(absolutePath, 'utf-8')
  const parsed = matter(original)
  const frontmatter = parsed.data ?? {}
  if (frontmatter.archived === true) {
    return { ok: false, appliedAction: 'archive', resultMessage: copy.alreadyArchived() }
  }
  frontmatter.archived = true
  const next = matter.stringify(parsed.content, frontmatter)
  return applyMutation(params, updateMutation('archive', params.item.filePath, absolutePath, original, next, copy.archived(params.item.filePath)))
}

function applyAddAlias(params: ApplyFixParams): ApplyFixResult {
  const copy = createApplyFixCopy(getApplyFixLanguage(params))
  const aliasInput = typeof params.payload?.alias === 'string'
    ? (params.payload.alias as string).trim()
    : ''
  if (!aliasInput) {
    return { ok: false, appliedAction: 'add_alias', resultMessage: copy.aliasRequired() }
  }
  const absolutePath = resolveVaultFile(params.vaultPath, params.item.filePath, getApplyFixLanguage(params))
  if (!existsSync(absolutePath)) {
    return { ok: false, appliedAction: 'add_alias', resultMessage: copy.fileNotFound(params.item.filePath) }
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
    return { ok: false, appliedAction: 'add_alias', resultMessage: copy.aliasExists(aliasInput) }
  }
  frontmatter.aliases = [...existing, aliasInput]
  const next = matter.stringify(parsed.content, frontmatter)
  return applyMutation(params, updateMutation('add_alias', params.item.filePath, absolutePath, original, next, copy.aliasAdded(aliasInput, params.item.filePath)))
}

function applyMutation(params: ApplyFixParams, mutation: MaintenanceMutation): ApplyFixResult {
  const copy = createApplyFixCopy(getApplyFixLanguage(params))
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
      resultMessage: copy.fileChangedSincePreview(mutation.filePath),
      filePath: mutation.filePath
    }
  }

  applyVaultFileMutation(params.vaultPath, mutation)
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
  const copy = createApplyFixCopy(getApplyFixLanguage(params))
  const token = typeof params.payload?.undoToken === 'string' ? params.payload.undoToken : ''
  if (!token) return { ok: false, appliedAction: params.action, resultMessage: copy.undoTokenRequired() }

  let recordPath: string
  try {
    recordPath = undoRecordPath(params.vaultPath, token)
  } catch {
    return { ok: false, appliedAction: params.action, resultMessage: copy.invalidUndoToken() }
  }
  if (!existsSync(recordPath)) {
    return { ok: false, appliedAction: params.action, resultMessage: copy.undoRecordMissing() }
  }

  const record = JSON.parse(readFileSync(recordPath, 'utf-8')) as MaintenanceUndoRecord
  if (Date.now() > record.expiresAt) {
    try { unlinkSync(recordPath) } catch { /* best effort */ }
    return { ok: false, appliedAction: record.action, resultMessage: copy.undoRecordMissing(), filePath: record.filePath }
  }
  const absolutePath = resolveVaultFile(params.vaultPath, record.filePath, getApplyFixLanguage(params))
  const currentExists = existsSync(absolutePath)
  const currentContent = currentExists ? readFileSync(absolutePath, 'utf-8') : null
  const currentHash = currentContent === null ? undefined : hashContent(currentContent)
  if (record.afterHash && currentHash !== record.afterHash) {
    return {
      ok: false,
      appliedAction: record.action,
      resultMessage: copy.cannotUndoChanged(record.filePath),
      filePath: record.filePath
    }
  }

  restoreVaultFileMutationBeforeState(params.vaultPath, { ...record, absolutePath })

  try { unlinkSync(recordPath) } catch { /* best effort */ }
  notifyVaultFilesChanged([absolutePath])
  return {
    ok: true,
    appliedAction: record.action,
    resultMessage: copy.undone(record.action, record.filePath),
    filePath: record.filePath
  }
}

function updateMutation(action: ApplyFixAction, filePath: string, absolutePath: string, before: string, after: string, resultMessage: string): MaintenanceMutation {
  return {
    action,
    resultMessage,
    ...createVaultFileUpdateMutation({
      filePath,
      absolutePath,
      beforeContent: before,
      afterContent: after
    })
  }
}

function mutationPreview(mutation: MaintenanceMutation): ApplyFixPreview {
  return previewVaultFileMutation(mutation, mutation.resultMessage)
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

function resolveVaultFile(vaultPath: string, filePath: string, language: AppLanguage = 'en'): string {
  return assertPathInsideVaultSync(resolve(vaultPath, filePath), vaultPath, language)
}

function assertPathInsideVaultSync(filePath: string, vaultPath: string, language: AppLanguage = 'en'): string {
  const copy = createApplyFixCopy(language)
  const requested = normalize(resolve(filePath))
  const normalizedVault = normalize(resolve(vaultPath))
  if (!isPathInside(requested, normalizedVault)) throw new Error(copy.pathOutsideVault())
  const realFile = realPathSafeSync(requested)
  const realVault = realPathSafeSync(normalizedVault)
  if (!isPathInside(realFile, realVault)) throw new Error(copy.pathEscapesVault())
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
