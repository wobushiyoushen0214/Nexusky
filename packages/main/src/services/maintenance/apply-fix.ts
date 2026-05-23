import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { indexNote } from '../indexer'
import { notifyVaultFilesChanged } from '../../ipc/events'
import type { KnowledgeMaintenanceItem } from '../ai/maintenance-queue'

export type ApplyFixAction = 'open_note' | 'create_target' | 'mark_done' | 'archive' | 'add_alias'

export interface ApplyFixParams {
  vaultPath: string
  item: KnowledgeMaintenanceItem
  action: ApplyFixAction
  payload?: Record<string, unknown>
}

export interface ApplyFixResult {
  ok: boolean
  appliedAction: string
  resultMessage: string
  filePath?: string
}

export function applyMaintenanceFix(params: ApplyFixParams): ApplyFixResult {
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
  const absolutePath = join(params.vaultPath, params.item.filePath)
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
  const targetTitle = typeof params.payload?.targetTitle === 'string'
    ? (params.payload.targetTitle as string).trim()
    : ''
  if (!targetTitle) {
    return { ok: false, appliedAction: 'create_target', resultMessage: 'targetTitle is required' }
  }
  const safeTitle = targetTitle.replace(/[\\/:*?"<>|]/g, ' ').trim()
  if (!safeTitle) {
    return { ok: false, appliedAction: 'create_target', resultMessage: 'targetTitle must contain valid characters' }
  }
  const targetRelative = `${safeTitle}.md`
  const targetAbsolute = join(params.vaultPath, targetRelative)
  if (existsSync(targetAbsolute)) {
    return {
      ok: false,
      appliedAction: 'create_target',
      resultMessage: `Note already exists: ${targetRelative}`,
      filePath: targetRelative
    }
  }
  writeFileSync(targetAbsolute, `# ${safeTitle}\n\n`, 'utf-8')
  try { indexNote(params.vaultPath, targetAbsolute) } catch { /* indexing is best effort */ }
  notifyVaultFilesChanged([targetAbsolute])
  return {
    ok: true,
    appliedAction: 'create_target',
    resultMessage: `Created ${targetRelative}`,
    filePath: targetRelative
  }
}

function applyMarkDone(params: ApplyFixParams): ApplyFixResult {
  const taskText = typeof params.payload?.taskText === 'string'
    ? (params.payload.taskText as string)
    : ''
  const absolutePath = join(params.vaultPath, params.item.filePath)
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
  writeFileSync(absolutePath, updated, 'utf-8')
  try { indexNote(params.vaultPath, absolutePath) } catch { /* best effort */ }
  notifyVaultFilesChanged([absolutePath])
  return {
    ok: true,
    appliedAction: 'mark_done',
    resultMessage: `Marked a task as done in ${params.item.filePath}`,
    filePath: params.item.filePath
  }
}

function applyArchive(params: ApplyFixParams): ApplyFixResult {
  const absolutePath = join(params.vaultPath, params.item.filePath)
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
  writeFileSync(absolutePath, next, 'utf-8')
  try { indexNote(params.vaultPath, absolutePath) } catch { /* best effort */ }
  notifyVaultFilesChanged([absolutePath])
  return {
    ok: true,
    appliedAction: 'archive',
    resultMessage: `Archived ${params.item.filePath}`,
    filePath: params.item.filePath
  }
}

function applyAddAlias(params: ApplyFixParams): ApplyFixResult {
  const aliasInput = typeof params.payload?.alias === 'string'
    ? (params.payload.alias as string).trim()
    : ''
  if (!aliasInput) {
    return { ok: false, appliedAction: 'add_alias', resultMessage: 'alias is required' }
  }
  const absolutePath = join(params.vaultPath, params.item.filePath)
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
  writeFileSync(absolutePath, next, 'utf-8')
  try { indexNote(params.vaultPath, absolutePath) } catch { /* best effort */ }
  notifyVaultFilesChanged([absolutePath])
  return {
    ok: true,
    appliedAction: 'add_alias',
    resultMessage: `Added alias "${aliasInput}" to ${params.item.filePath}`,
    filePath: params.item.filePath
  }
}
