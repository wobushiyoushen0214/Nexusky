import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { createHash } from 'crypto'
import { indexNote, removeNoteIndex } from '../indexer'
import { runAgentTool } from './tool-runner'
import { isAllowedAgentTool, isWriteStepKind, type AgentStepKind } from './step-kinds'
import {
  getAgentRun,
  getAgentStep,
  getAgentStepRollbackData,
  updateAgentRunStatus,
  updateAgentStep,
  type AgentStepRecord
} from './agent-store'

export interface ExecuteStepParams {
  vaultPath: string
  runId: string
  stepIndex: number
  dryRun: boolean
  signal?: AbortSignal
  overrides?: {
    content?: string
  }
}

export interface ExecuteStepResult {
  status: 'completed' | 'failed' | 'skipped'
  preview?: string
  content?: string
  error?: string
}

export async function executeAgentStep(params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const snapshot = getAgentRun(params.vaultPath, params.runId)
  if (!snapshot) return { status: 'failed', error: 'agent_run_not_found' }
  const step = snapshot.steps.find((s) => s.stepIndex === params.stepIndex)
  if (!step) return { status: 'failed', error: 'agent_step_not_found' }
  if (step.status === 'completed' || step.status === 'rolled_back') {
    return { status: 'skipped', preview: step.preview || undefined }
  }
  if (params.signal?.aborted) {
    updateAgentStep(params.vaultPath, params.runId, params.stepIndex, { status: 'failed', error: 'aborted' })
    return { status: 'failed', error: 'aborted' }
  }

  const now = nowSeconds()
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, { status: 'running', startedAt: now, error: null })

  try {
    const result = await dispatchStep(step, params, snapshot.steps)
    const completedAt = nowSeconds()
    if (result.status === 'completed') {
      updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
        status: 'completed',
        preview: result.preview,
        resultContent: result.content,
        completedAt
      })
    } else if (result.status === 'skipped') {
      updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
        status: 'skipped',
        preview: result.preview,
        completedAt
      })
    } else {
      updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
        status: 'failed',
        error: result.error,
        completedAt
      })
    }
    return result
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
      status: 'failed',
      error,
      completedAt: nowSeconds()
    })
    return { status: 'failed', error }
  }
}

async function dispatchStep(step: AgentStepRecord, params: ExecuteStepParams, allSteps: AgentStepRecord[]): Promise<ExecuteStepResult> {
  for (const dep of step.dependsOn) {
    const depStep = allSteps.find((s) => s.stepIndex === dep)
    if (!depStep || depStep.status !== 'completed') {
      return { status: 'failed', error: `dependency_not_satisfied: step ${dep}` }
    }
  }

  switch (step.kind as AgentStepKind) {
    case 'tool_call':
      return runToolCall(step, params)
    case 'file_create':
      return runFileCreate(step, params)
    case 'file_write':
      return runFileWrite(step, params)
    case 'task_update':
      return runTaskUpdate(step, params)
    case 'note_edit':
      return runNoteEdit(step, params)
    default:
      return { status: 'failed', error: `unknown_step_kind: ${step.kind}` }
  }
}

async function runToolCall(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  if (!step.toolName || !isAllowedAgentTool(step.toolName)) {
    return { status: 'failed', error: 'tool_not_allowed' }
  }
  const currentFilePath = typeof step.args.currentFilePath === 'string' ? step.args.currentFilePath : undefined
  const result = await runAgentTool(step.toolName, step.args, params.vaultPath, currentFilePath ?? null)
  const preview = truncate(result.content, 4000)
  return { status: 'completed', preview, content: result.content }
}

async function runFileCreate(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const relPath = getStringArg(step.args, 'filePath') || getStringArg(step.args, 'path')
  const content = params.overrides?.content ?? getStringArg(step.args, 'content')
  if (!relPath) return { status: 'failed', error: 'missing_file_path' }
  if (content === undefined) return { status: 'failed', error: 'missing_content' }
  const targetPath = resolveVaultPath(params.vaultPath, relPath)
  if (!targetPath) return { status: 'failed', error: 'invalid_target_path' }
  const preview = formatPreview(`Create file: ${relPath}`, content)
  if (params.dryRun) {
    return { status: 'completed', preview, content }
  }
  if (existsSync(targetPath)) {
    return { status: 'failed', error: 'file_exists' }
  }
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, content, 'utf-8')
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'file_create', filePath: relPath, createdHash: hashContent(content) }
  })
  safeIndex(params.vaultPath, targetPath)
  return { status: 'completed', preview, content }
}

async function runFileWrite(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const relPath = getStringArg(step.args, 'filePath') || getStringArg(step.args, 'path')
  if (!relPath) return { status: 'failed', error: 'missing_file_path' }
  const targetPath = resolveVaultPath(params.vaultPath, relPath)
  if (!targetPath) return { status: 'failed', error: 'invalid_target_path' }
  if (!existsSync(targetPath)) return { status: 'failed', error: 'file_not_found' }
  const previousContent = readFileSync(targetPath, 'utf-8')
  const nextContent = params.overrides?.content ?? getStringArg(step.args, 'content')
  if (nextContent === undefined) return { status: 'failed', error: 'missing_content' }
  const preview = formatDiffPreview(previousContent, nextContent, relPath)
  if (params.dryRun) {
    return { status: 'completed', preview, content: nextContent }
  }
  writeFileSync(targetPath, nextContent, 'utf-8')
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'file_write', filePath: relPath, previousContent, afterHash: hashContent(nextContent) }
  })
  safeIndex(params.vaultPath, targetPath)
  return { status: 'completed', preview, content: nextContent }
}

async function runTaskUpdate(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const relPath = getStringArg(step.args, 'filePath') || getStringArg(step.args, 'path')
  const action = getStringArg(step.args, 'action') || 'mark_done'
  const lineRaw = step.args.line
  const line = typeof lineRaw === 'number' ? lineRaw : Number(lineRaw)
  if (!relPath || !Number.isFinite(line) || line < 1) return { status: 'failed', error: 'missing_task_target' }
  const targetPath = resolveVaultPath(params.vaultPath, relPath)
  if (!targetPath || !existsSync(targetPath)) return { status: 'failed', error: 'file_not_found' }
  const original = readFileSync(targetPath, 'utf-8')
  const lines = original.split(/\r?\n/)
  const idx = Math.floor(line) - 1
  if (idx < 0 || idx >= lines.length) return { status: 'failed', error: 'line_out_of_range' }
  const previousLine = lines[idx]
  const nextLine = action === 'mark_done'
    ? previousLine.replace(/^(\s*[-*+]\s*\[)[ xX](\])/, '$1x$2')
    : previousLine
  if (nextLine === previousLine) return { status: 'failed', error: 'task_already_in_state' }
  lines[idx] = nextLine
  const nextContent = lines.join('\n')
  const preview = formatPreview(`Task ${action} @ ${relPath}:${line}`, `- ${previousLine}\n+ ${nextLine}`)
  if (params.dryRun) {
    return { status: 'completed', preview, content: nextContent }
  }
  writeFileSync(targetPath, nextContent, 'utf-8')
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'task_update', filePath: relPath, line: idx + 1, previousLine, afterHash: hashContent(nextContent) }
  })
  safeIndex(params.vaultPath, targetPath)
  return { status: 'completed', preview, content: nextContent }
}

async function runNoteEdit(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const relPath = getStringArg(step.args, 'filePath') || getStringArg(step.args, 'path')
  const instruction = getStringArg(step.args, 'instruction')
  if (!relPath || !instruction) return { status: 'failed', error: 'missing_edit_target' }
  const targetPath = resolveVaultPath(params.vaultPath, relPath)
  if (!targetPath || !existsSync(targetPath)) return { status: 'failed', error: 'file_not_found' }
  const previousContent = readFileSync(targetPath, 'utf-8')
  const proposed = params.overrides?.content
  if (proposed === undefined) {
    return {
      status: 'completed',
      preview: formatPreview(`Edit pending user diff: ${relPath}`, instruction),
      content: previousContent
    }
  }
  const preview = formatDiffPreview(previousContent, proposed, relPath)
  if (params.dryRun) {
    return { status: 'completed', preview, content: proposed }
  }
  writeFileSync(targetPath, proposed, 'utf-8')
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'note_edit', filePath: relPath, previousContent, afterHash: hashContent(proposed) }
  })
  safeIndex(params.vaultPath, targetPath)
  return { status: 'completed', preview, content: proposed }
}

export async function runAgentToFinish(params: { vaultPath: string; runId: string; signal?: AbortSignal }): Promise<void> {
  const snapshot = getAgentRun(params.vaultPath, params.runId)
  if (!snapshot) return
  const startedAt = snapshot.run.startedAt ?? nowSeconds()
  updateAgentRunStatus(params.vaultPath, params.runId, { status: 'running', startedAt })
  for (const step of snapshot.steps) {
    if (params.signal?.aborted) {
      updateAgentRunStatus(params.vaultPath, params.runId, { status: 'cancelled', completedAt: nowSeconds() })
      return
    }
    if (step.status === 'completed' || step.status === 'skipped' || step.status === 'rolled_back') continue
    updateAgentRunStatus(params.vaultPath, params.runId, { status: 'running', currentStepIndex: step.stepIndex })
    const result = await executeAgentStep({
      vaultPath: params.vaultPath,
      runId: params.runId,
      stepIndex: step.stepIndex,
      dryRun: snapshot.run.dryRun,
      signal: params.signal
    })
    if (result.status === 'failed') {
      updateAgentRunStatus(params.vaultPath, params.runId, {
        status: 'failed',
        error: result.error || 'step_failed',
        completedAt: nowSeconds()
      })
      return
    }
  }
  updateAgentRunStatus(params.vaultPath, params.runId, { status: 'completed', completedAt: nowSeconds() })
}

export function rollbackAgentStep(vaultPath: string, runId: string, stepIndex: number): { ok: boolean; error?: string } {
  const step = getAgentStep(vaultPath, runId, stepIndex)
  if (!step) return { ok: false, error: 'step_not_found' }
  if (!step.hasRollback) return { ok: false, error: 'nothing_to_rollback' }
  const data = getAgentStepRollbackData(vaultPath, runId, stepIndex)
  if (!data) return { ok: false, error: 'rollback_data_missing' }
  const kind = data.kind as string | undefined
  const relPath = typeof data.filePath === 'string' ? data.filePath : null
  if (!relPath) return { ok: false, error: 'rollback_target_missing' }
  const targetPath = resolveVaultPath(vaultPath, relPath)
  if (!targetPath) return { ok: false, error: 'invalid_target_path' }
  try {
    if (kind === 'file_create') {
      if (existsSync(targetPath)) {
        // Guard against destroying user work: only delete if the file is still
        // exactly what the agent created. If the user edited it after creation,
        // refuse rather than silently wiping their changes.
        const createdHash = typeof data.createdHash === 'string' ? data.createdHash : null
        if (createdHash) {
          const current = createHash('md5').update(readFileSync(targetPath)).digest('hex')
          if (current !== createdHash) return { ok: false, error: 'file_modified_since_create' }
        }
        moveCreatedFileToTrash(vaultPath, targetPath)
      }
      removeNoteIndex(vaultPath, targetPath)
    } else if (kind === 'file_write' || kind === 'note_edit') {
      // Never truncate to empty on a missing/corrupt baseline — abort instead.
      if (typeof data.previousContent !== 'string') return { ok: false, error: 'rollback_data_invalid' }
      // Don't clobber edits the user made after the agent wrote: only restore if
      // the file is still exactly the agent's version.
      const afterHash = typeof data.afterHash === 'string' ? data.afterHash : null
      if (afterHash && existsSync(targetPath)) {
        const current = createHash('md5').update(readFileSync(targetPath)).digest('hex')
        if (current !== afterHash) return { ok: false, error: 'file_modified_since_write' }
      }
      writeFileSync(targetPath, data.previousContent, 'utf-8')
    } else if (kind === 'task_update') {
      const prevLine = typeof data.previousLine === 'string' ? data.previousLine : null
      const line = typeof data.line === 'number' ? data.line : Number(data.line)
      if (prevLine === null || !Number.isFinite(line)) return { ok: false, error: 'rollback_data_invalid' }
      const original = readFileSync(targetPath, 'utf-8')
      const afterHash = typeof data.afterHash === 'string' ? data.afterHash : null
      if (afterHash && createHash('md5').update(original, 'utf-8').digest('hex') !== afterHash) {
        return { ok: false, error: 'file_modified_since_write' }
      }
      const lines = original.split(/\r?\n/)
      const idx = Math.floor(line) - 1
      if (idx < 0 || idx >= lines.length) return { ok: false, error: 'rollback_line_oor' }
      lines[idx] = prevLine
      writeFileSync(targetPath, lines.join('\n'), 'utf-8')
    } else {
      return { ok: false, error: 'rollback_kind_unsupported' }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  updateAgentStep(vaultPath, runId, stepIndex, { status: 'rolled_back', completedAt: nowSeconds() })
  if (kind !== 'file_create') safeIndex(vaultPath, targetPath)
  return { ok: true }
}

export function rollbackAgentRun(vaultPath: string, runId: string): { ok: boolean; rolledBack: number; errors: string[] } {
  const snapshot = getAgentRun(vaultPath, runId)
  if (!snapshot) return { ok: false, rolledBack: 0, errors: ['run_not_found'] }
  const errors: string[] = []
  let rolledBack = 0
  for (const step of [...snapshot.steps].reverse()) {
    if (!step.hasRollback) continue
    const res = rollbackAgentStep(vaultPath, runId, step.stepIndex)
    if (res.ok) rolledBack++
    else if (res.error) errors.push(`step ${step.stepIndex}: ${res.error}`)
  }
  return { ok: errors.length === 0, rolledBack, errors }
}

function resolveVaultPath(vaultPath: string, relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (isAbsolute(normalized)) {
    const rel = relative(vaultPath, normalized)
    if (rel.startsWith('..') || isAbsolute(rel)) return null
    return resolve(normalized)
  }
  const full = resolve(join(vaultPath, normalized))
  const rel = relative(vaultPath, full)
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return full
}

function safeIndex(vaultPath: string, filePath: string): void {
  try {
    indexNote(vaultPath, filePath)
  } catch {
    // tolerate reindex failures; vault watcher will catch up.
  }
}

function moveCreatedFileToTrash(vaultPath: string, targetPath: string): void {
  const trashDir = join(vaultPath, '.trash')
  mkdirSync(trashDir, { recursive: true })
  const timestamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  const trashPath = join(trashDir, `${timestamp}_${rand}_${basename(targetPath)}`)
  renameSync(targetPath, trashPath)
  const originalPath = relative(vaultPath, targetPath).replace(/\\/g, '/')
  writeFileSync(`${trashPath}.json`, JSON.stringify({ originalPath, deletedAt: timestamp }), 'utf-8')
}

function getStringArg(args: Record<string, unknown>, key: string): string {
  const value = args?.[key]
  return typeof value === 'string' ? value : ''
}

function formatPreview(title: string, body: string): string {
  return `${title}\n\n${truncate(body, 4000)}`
}

function formatDiffPreview(previous: string, next: string, label: string): string {
  const prevLines = previous.split(/\r?\n/)
  const nextLines = next.split(/\r?\n/)
  const added = nextLines.length - prevLines.length
  return `Diff @ ${label}\nprevious: ${prevLines.length} lines\nnext: ${nextLines.length} lines (Δ ${added >= 0 ? '+' : ''}${added})\n\n--- preview (first 400 chars) ---\n${truncate(next, 400)}`
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function hashContent(content: string): string {
  return createHash('md5').update(content, 'utf-8').digest('hex')
}

export function isWriteStep(kind: AgentStepKind): boolean {
  return isWriteStepKind(kind)
}
