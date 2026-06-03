import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { basename, dirname, extname, join, relative } from 'path'
import { createHash } from 'crypto'
import matter from 'gray-matter'
import { indexNote, removeNoteIndex } from '../indexer'
import { applyVaultFileMutation, createVaultFileCreateMutation, createVaultFileUpdateMutation } from '../vault-mutation'
import { collectWikilinkUpdates, deleteVaultPath, moveVaultPath, renameVaultMarkdownWithLinkUpdates, resolveVaultPath } from '../file-operation-mutation'
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
    case 'move_file':
      return runMoveFile(step, params)
    case 'rename_file':
      return runRenameFile(step, params)
    case 'delete_file':
      return runDeleteFile(step, params)
    case 'apply_tag':
      return runApplyTag(step, params)
    case 'update_frontmatter':
      return runUpdateFrontmatter(step, params)
    case 'create_link':
      return runCreateLink(step, params)
    case 'merge_notes':
      return runMergeNotes(step, params)
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
  const mutation = createVaultFileCreateMutation({
    filePath: relPath,
    absolutePath: targetPath,
    afterContent: content
  })
  applyVaultFileMutation(params.vaultPath, mutation)
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'file_create', filePath: relPath, createdHash: mutation.afterHash }
  })
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
  const mutation = createVaultFileUpdateMutation({
    filePath: relPath,
    absolutePath: targetPath,
    beforeContent: previousContent,
    afterContent: nextContent
  })
  applyVaultFileMutation(params.vaultPath, mutation)
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'file_write', filePath: relPath, previousContent, afterHash: mutation.afterHash }
  })
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
  const mutation = createVaultFileUpdateMutation({
    filePath: relPath,
    absolutePath: targetPath,
    beforeContent: original,
    afterContent: nextContent
  })
  applyVaultFileMutation(params.vaultPath, mutation)
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'task_update', filePath: relPath, line: idx + 1, previousLine, afterHash: mutation.afterHash }
  })
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
  const mutation = createVaultFileUpdateMutation({
    filePath: relPath,
    absolutePath: targetPath,
    beforeContent: previousContent,
    afterContent: proposed
  })
  applyVaultFileMutation(params.vaultPath, mutation)
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'note_edit', filePath: relPath, previousContent, afterHash: mutation.afterHash }
  })
  return { status: 'completed', preview, content: proposed }
}

async function runMoveFile(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const sourceRel = getPathArg(step.args, ['sourcePath', 'fromPath', 'filePath', 'path'])
  const targetRel = getPathArg(step.args, ['targetPath', 'toPath', 'newPath'])
  if (!sourceRel || !targetRel) return { status: 'failed', error: 'missing_move_target' }
  const sourcePath = resolveVaultPath(params.vaultPath, sourceRel)
  const targetPath = resolveVaultPath(params.vaultPath, targetRel)
  if (!sourcePath || !targetPath) return { status: 'failed', error: 'invalid_target_path' }
  if (!existsSync(sourcePath)) return { status: 'failed', error: 'file_not_found' }
  if (existsSync(targetPath)) return { status: 'failed', error: 'target_file_exists' }
  const preview = formatPreview(`Move file: ${sourceRel} -> ${targetRel}`, `Source: ${sourceRel}\nTarget: ${targetRel}\nRisk: updates the file path only.`)
  if (params.dryRun) return { status: 'completed', preview }

  const moved = await moveVaultPath({
    vaultPath: params.vaultPath,
    sourcePath,
    targetPath,
    kind: 'move',
    source: 'agent',
    reason: 'agent_move_file'
  })
  if (!moved.ok) return { status: 'failed', error: moved.error || 'move_failed' }
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'move_file', sourcePath: sourceRel, targetPath: targetRel, movedHash: moved.hash }
  })
  return { status: 'completed', preview }
}

async function runRenameFile(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const sourceRel = getPathArg(step.args, ['sourcePath', 'fromPath', 'filePath', 'path'])
  const targetRel = resolveRenameTarget(sourceRel, step.args)
  if (!sourceRel || !targetRel) return { status: 'failed', error: 'missing_rename_target' }
  const sourcePath = resolveVaultPath(params.vaultPath, sourceRel)
  const targetPath = resolveVaultPath(params.vaultPath, targetRel)
  if (!sourcePath || !targetPath) return { status: 'failed', error: 'invalid_target_path' }
  if (!existsSync(sourcePath)) return { status: 'failed', error: 'file_not_found' }
  if (existsSync(targetPath)) return { status: 'failed', error: 'target_file_exists' }

  const linkUpdates = collectWikilinkUpdates(params.vaultPath, sourceRel, targetRel)
  const preview = formatPreview(
    `Rename file: ${sourceRel} -> ${targetRel}`,
    [
      `File: ${sourceRel} -> ${targetRel}`,
      `Link updates: ${linkUpdates.length}`,
      ...linkUpdates.slice(0, 8).map((update) => `- ${update.relPath}`)
    ].join('\n')
  )
  if (params.dryRun) return { status: 'completed', preview }

  const renamed = await renameVaultMarkdownWithLinkUpdates({
    vaultPath: params.vaultPath,
    sourcePath,
    targetPath,
    source: 'agent',
    reason: 'agent_rename_file'
  })
  if (!renamed.ok) return { status: 'failed', error: renamed.error || 'rename_failed' }
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: {
      kind: 'rename_file',
      sourcePath: sourceRel,
      targetPath: targetRel,
      movedHash: renamed.hash,
      previousContents: renamed.linkUpdates.map((update) => ({ filePath: update.relPath, content: update.previousContent })),
      afterHashes: renamed.afterHashes
    }
  })
  return { status: 'completed', preview }
}

async function runDeleteFile(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const relPath = getPathArg(step.args, ['filePath', 'path'])
  if (!relPath) return { status: 'failed', error: 'missing_file_path' }
  const targetPath = resolveVaultPath(params.vaultPath, relPath)
  if (!targetPath) return { status: 'failed', error: 'invalid_target_path' }
  if (!existsSync(targetPath)) return { status: 'failed', error: 'file_not_found' }
  const preview = formatPreview(`Move file to trash: ${relPath}`, `The file will be moved to vault .trash and can be restored by run rollback.`)
  if (params.dryRun) return { status: 'completed', preview }

  const deleted = await deleteVaultPath({
    vaultPath: params.vaultPath,
    filePath: targetPath,
    source: 'agent',
    reason: 'agent_delete_file'
  })
  if (!deleted.ok || !deleted.trashRelPath) return { status: 'failed', error: deleted.error || 'delete_failed' }
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'delete_file', filePath: relPath, trashPath: deleted.trashRelPath, beforeHash: deleted.hash }
  })
  return { status: 'completed', preview }
}

async function runApplyTag(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const relPath = getPathArg(step.args, ['filePath', 'path'])
  const tag = getStringArg(step.args, 'tag').replace(/^#/, '').trim()
  if (!relPath || !tag) return { status: 'failed', error: 'missing_tag_target' }
  const targetPath = resolveVaultPath(params.vaultPath, relPath)
  if (!targetPath || !existsSync(targetPath)) return { status: 'failed', error: 'file_not_found' }
  const previousContent = readFileSync(targetPath, 'utf-8')
  const parsed = matter(previousContent)
  const data = { ...(parsed.data || {}) }
  const tags = normalizeTags(data.tags)
  if (!tags.includes(tag)) tags.push(tag)
  data.tags = tags
  const nextContent = matter.stringify(parsed.content, data)
  const preview = formatDiffPreview(previousContent, nextContent, relPath)
  if (params.dryRun) return { status: 'completed', preview, content: nextContent }
  const mutation = createVaultFileUpdateMutation({
    filePath: relPath,
    absolutePath: targetPath,
    beforeContent: previousContent,
    afterContent: nextContent
  })
  applyVaultFileMutation(params.vaultPath, mutation)
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'apply_tag', filePath: relPath, previousContent, afterHash: mutation.afterHash }
  })
  return { status: 'completed', preview, content: nextContent }
}

async function runUpdateFrontmatter(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const relPath = getPathArg(step.args, ['filePath', 'path'])
  const patch = getObjectArg(step.args, 'properties') || getObjectArg(step.args, 'patch')
  if (!relPath || !patch) return { status: 'failed', error: 'missing_frontmatter_patch' }
  const targetPath = resolveVaultPath(params.vaultPath, relPath)
  if (!targetPath || !existsSync(targetPath)) return { status: 'failed', error: 'file_not_found' }
  const previousContent = readFileSync(targetPath, 'utf-8')
  const parsed = matter(previousContent)
  const data = { ...(parsed.data || {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (!isSafeFrontmatterKey(key)) continue
    if (value === null) delete data[key]
    else data[key] = sanitizeFrontmatterValue(value)
  }
  const nextContent = matter.stringify(parsed.content, data)
  const preview = formatDiffPreview(previousContent, nextContent, relPath)
  if (params.dryRun) return { status: 'completed', preview, content: nextContent }
  const mutation = createVaultFileUpdateMutation({
    filePath: relPath,
    absolutePath: targetPath,
    beforeContent: previousContent,
    afterContent: nextContent
  })
  applyVaultFileMutation(params.vaultPath, mutation)
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'update_frontmatter', filePath: relPath, previousContent, afterHash: mutation.afterHash }
  })
  return { status: 'completed', preview, content: nextContent }
}

async function runCreateLink(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const relPath = getPathArg(step.args, ['filePath', 'sourcePath', 'path'])
  const target = getStringArg(step.args, 'targetTitle') || getStringArg(step.args, 'targetPath')
  const anchorText = getStringArg(step.args, 'anchorText')
  if (!relPath || !target) return { status: 'failed', error: 'missing_link_target' }
  const targetPath = resolveVaultPath(params.vaultPath, relPath)
  if (!targetPath || !existsSync(targetPath)) return { status: 'failed', error: 'file_not_found' }
  const previousContent = readFileSync(targetPath, 'utf-8')
  const wikiTarget = normalizeWikiTarget(target)
  if (hasWikiLinkTo(previousContent, wikiTarget)) return { status: 'failed', error: 'duplicate_link' }
  const link = anchorText && previousContent.includes(anchorText)
    ? `[[${wikiTarget}|${anchorText}]]`
    : `[[${wikiTarget}]]`
  const nextContent = anchorText && previousContent.includes(anchorText)
    ? previousContent.replace(anchorText, link)
    : `${previousContent.replace(/\s+$/g, '')}\n\nRelated: ${link}\n`
  const preview = formatDiffPreview(previousContent, nextContent, relPath)
  if (params.dryRun) return { status: 'completed', preview, content: nextContent }
  const mutation = createVaultFileUpdateMutation({
    filePath: relPath,
    absolutePath: targetPath,
    beforeContent: previousContent,
    afterContent: nextContent
  })
  applyVaultFileMutation(params.vaultPath, mutation)
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: { kind: 'create_link', filePath: relPath, previousContent, afterHash: mutation.afterHash }
  })
  return { status: 'completed', preview, content: nextContent }
}

async function runMergeNotes(step: AgentStepRecord, params: ExecuteStepParams): Promise<ExecuteStepResult> {
  const sourcePaths = getStringArrayArg(step.args, 'sourcePaths')
  const targetRel = getPathArg(step.args, ['targetPath', 'filePath'])
  if (sourcePaths.length < 2 || !targetRel) return { status: 'failed', error: 'missing_merge_targets' }
  const sources = sourcePaths.map((relPath) => ({ relPath, absPath: resolveVaultPath(params.vaultPath, relPath) }))
  if (sources.some((source) => !source.absPath || !existsSync(source.absPath))) return { status: 'failed', error: 'file_not_found' }
  const targetPath = resolveVaultPath(params.vaultPath, targetRel)
  if (!targetPath) return { status: 'failed', error: 'invalid_target_path' }
  const targetExists = existsSync(targetPath)
  const previousTargetContent = targetExists ? readFileSync(targetPath, 'utf-8') : null
  const merged = buildMergedNoteContent(sources as { relPath: string; absPath: string }[], targetRel, previousTargetContent)
  const preview = formatPreview(
    `Merge notes into ${targetRel}`,
    [`Sources:`, ...sourcePaths.map((source) => `- ${source}`), '', truncate(merged, 1200)].join('\n')
  )
  if (params.dryRun) return { status: 'completed', preview, content: merged }
  if (step.args.confirmHighRisk !== true) return { status: 'failed', error: 'high_risk_requires_confirmation' }

  const targetMutation = targetExists
    ? createVaultFileUpdateMutation({
      filePath: targetRel,
      absolutePath: targetPath,
      beforeContent: previousTargetContent ?? '',
      afterContent: merged
    })
    : createVaultFileCreateMutation({
      filePath: targetRel,
      absolutePath: targetPath,
      afterContent: merged
    })
  applyVaultFileMutation(params.vaultPath, targetMutation)
  const trashedSources: { filePath: string; trashPath: string; beforeHash: string }[] = []
  for (const source of sources as { relPath: string; absPath: string }[]) {
    if (source.relPath === targetRel) continue
    const deleted = await deleteVaultPath({
      vaultPath: params.vaultPath,
      filePath: source.absPath,
      source: 'agent',
      reason: 'agent_merge_source'
    })
    if (!deleted.ok || !deleted.trashRelPath) return { status: 'failed', error: deleted.error || 'merge_delete_failed' }
    trashedSources.push({ filePath: source.relPath, trashPath: deleted.trashRelPath, beforeHash: deleted.hash || '' })
  }
  updateAgentStep(params.vaultPath, params.runId, params.stepIndex, {
    rollbackData: {
      kind: 'merge_notes',
      targetPath: targetRel,
      beforeTargetExists: targetExists,
      beforeTargetContent: previousTargetContent,
      afterHash: targetMutation.afterHash,
      trashedSources
    }
  })
  return { status: 'completed', preview, content: merged }
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
  const relPath = typeof data.filePath === 'string'
    ? data.filePath
    : typeof data.targetPath === 'string'
      ? data.targetPath
      : typeof data.sourcePath === 'string'
        ? data.sourcePath
        : null
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
          if (!contentMatchesStoredHash(readFileSync(targetPath, 'utf-8'), createdHash)) return { ok: false, error: 'file_modified_since_create' }
        }
        moveCreatedFileToTrash(vaultPath, targetPath)
      }
      removeNoteIndex(vaultPath, targetPath)
    } else if (
      kind === 'file_write'
      || kind === 'note_edit'
      || kind === 'apply_tag'
      || kind === 'update_frontmatter'
      || kind === 'create_link'
    ) {
      // Never truncate to empty on a missing/corrupt baseline — abort instead.
      if (typeof data.previousContent !== 'string') return { ok: false, error: 'rollback_data_invalid' }
      // Don't clobber edits the user made after the agent wrote: only restore if
      // the file is still exactly the agent's version.
      const afterHash = typeof data.afterHash === 'string' ? data.afterHash : null
      if (afterHash && existsSync(targetPath)) {
        if (!contentMatchesStoredHash(readFileSync(targetPath, 'utf-8'), afterHash)) return { ok: false, error: 'file_modified_since_write' }
      }
      writeFileSync(targetPath, data.previousContent, 'utf-8')
    } else if (kind === 'move_file') {
      const sourceRel = typeof data.sourcePath === 'string' ? data.sourcePath : null
      const targetRel = typeof data.targetPath === 'string' ? data.targetPath : relPath
      if (!sourceRel || !targetRel) return { ok: false, error: 'rollback_data_invalid' }
      const movedPath = resolveVaultPath(vaultPath, targetRel)
      const originalPath = resolveVaultPath(vaultPath, sourceRel)
      if (!movedPath || !originalPath) return { ok: false, error: 'invalid_target_path' }
      if (!existsSync(movedPath)) return { ok: false, error: 'moved_file_missing' }
      if (existsSync(originalPath)) return { ok: false, error: 'rollback_target_exists' }
      const movedHash = typeof data.movedHash === 'string' ? data.movedHash : null
      if (movedHash && !contentMatchesStoredHash(readFileSync(movedPath, 'utf-8'), movedHash)) {
        return { ok: false, error: 'file_modified_since_move' }
      }
      mkdirSync(dirname(originalPath), { recursive: true })
      renameSync(movedPath, originalPath)
      removeNoteIndex(vaultPath, movedPath)
      safeIndex(vaultPath, originalPath)
    } else if (kind === 'rename_file') {
      const sourceRel = typeof data.sourcePath === 'string' ? data.sourcePath : null
      const targetRel = typeof data.targetPath === 'string' ? data.targetPath : relPath
      if (!sourceRel || !targetRel) return { ok: false, error: 'rollback_data_invalid' }
      const renamedPath = resolveVaultPath(vaultPath, targetRel)
      const originalPath = resolveVaultPath(vaultPath, sourceRel)
      if (!renamedPath || !originalPath) return { ok: false, error: 'invalid_target_path' }
      if (!existsSync(renamedPath)) return { ok: false, error: 'renamed_file_missing' }
      if (existsSync(originalPath)) return { ok: false, error: 'rollback_target_exists' }
      const movedHash = typeof data.movedHash === 'string' ? data.movedHash : null
      if (movedHash && !contentMatchesStoredHash(readFileSync(renamedPath, 'utf-8'), movedHash)) {
        return { ok: false, error: 'file_modified_since_rename' }
      }
      const previousContents = Array.isArray(data.previousContents) ? data.previousContents : []
      const afterHashByPath = new Map<string, string>()
      if (Array.isArray(data.afterHashes)) {
        for (const entry of data.afterHashes) {
          if (!entry || typeof entry !== 'object') continue
          const filePath = typeof (entry as Record<string, unknown>).filePath === 'string'
            ? (entry as Record<string, unknown>).filePath as string
            : ''
          const hash = typeof (entry as Record<string, unknown>).hash === 'string'
            ? (entry as Record<string, unknown>).hash as string
            : ''
          if (filePath && hash) afterHashByPath.set(filePath, hash)
        }
      }
      for (const entry of previousContents) {
        if (!entry || typeof entry !== 'object') continue
        const filePath = typeof (entry as Record<string, unknown>).filePath === 'string'
          ? (entry as Record<string, unknown>).filePath as string
          : ''
        if (!filePath) continue
        const currentRelPath = filePath === sourceRel ? targetRel : filePath
        const currentPath = resolveVaultPath(vaultPath, currentRelPath)
        const expectedHash = afterHashByPath.get(currentRelPath)
        if (!currentPath || !existsSync(currentPath)) return { ok: false, error: 'rollback_link_update_missing' }
        if (expectedHash && !contentMatchesStoredHash(readFileSync(currentPath, 'utf-8'), expectedHash)) {
          return { ok: false, error: 'link_modified_since_rename' }
        }
      }
      mkdirSync(dirname(originalPath), { recursive: true })
      renameSync(renamedPath, originalPath)
      for (const entry of previousContents) {
        if (!entry || typeof entry !== 'object') continue
        const filePath = typeof (entry as Record<string, unknown>).filePath === 'string'
          ? (entry as Record<string, unknown>).filePath as string
          : ''
        const content = typeof (entry as Record<string, unknown>).content === 'string'
          ? (entry as Record<string, unknown>).content as string
          : null
        if (!filePath || content === null) continue
        const restorePath = resolveVaultPath(vaultPath, filePath)
        if (!restorePath) continue
        writeFileSync(restorePath, content, 'utf-8')
        safeIndex(vaultPath, restorePath)
      }
      removeNoteIndex(vaultPath, renamedPath)
      safeIndex(vaultPath, originalPath)
    } else if (kind === 'delete_file') {
      const trashRel = typeof data.trashPath === 'string' ? data.trashPath : null
      if (!trashRel) return { ok: false, error: 'rollback_data_invalid' }
      const trashPath = resolveVaultPath(vaultPath, trashRel)
      if (!trashPath || !existsSync(trashPath)) return { ok: false, error: 'trash_file_missing' }
      if (existsSync(targetPath)) return { ok: false, error: 'rollback_target_exists' }
      mkdirSync(dirname(targetPath), { recursive: true })
      renameSync(trashPath, targetPath)
      safeIndex(vaultPath, targetPath)
    } else if (kind === 'merge_notes') {
      const targetRel = typeof data.targetPath === 'string' ? data.targetPath : relPath
      const mergeTargetPath = resolveVaultPath(vaultPath, targetRel)
      if (!mergeTargetPath) return { ok: false, error: 'invalid_target_path' }
      const afterHash = typeof data.afterHash === 'string' ? data.afterHash : null
      if (afterHash && existsSync(mergeTargetPath) && !contentMatchesStoredHash(readFileSync(mergeTargetPath, 'utf-8'), afterHash)) {
        return { ok: false, error: 'file_modified_since_merge' }
      }
      if (data.beforeTargetExists === true) {
        if (typeof data.beforeTargetContent !== 'string') return { ok: false, error: 'rollback_data_invalid' }
        writeFileSync(mergeTargetPath, data.beforeTargetContent, 'utf-8')
        safeIndex(vaultPath, mergeTargetPath)
      } else if (existsSync(mergeTargetPath)) {
        moveFileToTrash(vaultPath, mergeTargetPath)
        removeNoteIndex(vaultPath, mergeTargetPath)
      }
      const trashedSources = Array.isArray(data.trashedSources) ? data.trashedSources : []
      for (const entry of trashedSources) {
        if (!entry || typeof entry !== 'object') continue
        const filePath = typeof (entry as Record<string, unknown>).filePath === 'string'
          ? (entry as Record<string, unknown>).filePath as string
          : ''
        const trashPathRel = typeof (entry as Record<string, unknown>).trashPath === 'string'
          ? (entry as Record<string, unknown>).trashPath as string
          : ''
        if (!filePath || !trashPathRel) continue
        const sourcePath = resolveVaultPath(vaultPath, filePath)
        const trashPath = resolveVaultPath(vaultPath, trashPathRel)
        if (!sourcePath || !trashPath || !existsSync(trashPath) || existsSync(sourcePath)) continue
        mkdirSync(dirname(sourcePath), { recursive: true })
        renameSync(trashPath, sourcePath)
        safeIndex(vaultPath, sourcePath)
      }
    } else if (kind === 'task_update') {
      const prevLine = typeof data.previousLine === 'string' ? data.previousLine : null
      const line = typeof data.line === 'number' ? data.line : Number(data.line)
      if (prevLine === null || !Number.isFinite(line)) return { ok: false, error: 'rollback_data_invalid' }
      const original = readFileSync(targetPath, 'utf-8')
      const afterHash = typeof data.afterHash === 'string' ? data.afterHash : null
      if (afterHash && !contentMatchesStoredHash(original, afterHash)) {
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
  if (kind !== 'file_create' && kind !== 'move_file' && kind !== 'rename_file' && kind !== 'delete_file' && kind !== 'merge_notes') safeIndex(vaultPath, targetPath)
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

function safeIndex(vaultPath: string, filePath: string): void {
  try {
    indexNote(vaultPath, filePath)
  } catch {
    // tolerate reindex failures; vault watcher will catch up.
  }
}

function moveCreatedFileToTrash(vaultPath: string, targetPath: string): void {
  moveFileToTrash(vaultPath, targetPath)
}

function moveFileToTrash(vaultPath: string, targetPath: string): string {
  const trashDir = join(vaultPath, '.trash')
  mkdirSync(trashDir, { recursive: true })
  const timestamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 6)
  const trashPath = join(trashDir, `${timestamp}_${rand}_${basename(targetPath)}`)
  renameSync(targetPath, trashPath)
  const originalPath = relative(vaultPath, targetPath).replace(/\\/g, '/')
  writeFileSync(`${trashPath}.json`, JSON.stringify({ originalPath, deletedAt: timestamp }), 'utf-8')
  return relative(vaultPath, trashPath).replace(/\\/g, '/')
}

function getPathArg(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getStringArg(args, key).trim()
    if (value) return value.replace(/\\/g, '/').replace(/^\/+/, '')
  }
  return ''
}

function getStringArg(args: Record<string, unknown>, key: string): string {
  const value = args?.[key]
  return typeof value === 'string' ? value : ''
}

function getObjectArg(args: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = args?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function getStringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args?.[key]
  if (!Array.isArray(value)) return []
  return value.map((item) => typeof item === 'string' ? item.trim().replace(/\\/g, '/').replace(/^\/+/, '') : '').filter(Boolean)
}

function resolveRenameTarget(sourceRel: string, args: Record<string, unknown>): string {
  const explicit = getPathArg(args, ['targetPath', 'toPath', 'newPath'])
  if (explicit) return explicit
  const newName = getStringArg(args, 'newName').trim()
  if (!sourceRel || !newName) return ''
  const extension = extname(sourceRel) || '.md'
  const safeName = newName.replace(/[\\/:*?"<>|]/g, ' ').trim()
  if (!safeName) return ''
  const dir = dirname(sourceRel).replace(/\\/g, '/')
  return (dir && dir !== '.') ? `${dir}/${safeName}${extension}` : `${safeName}${extension}`
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).replace(/^#/, '').trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value.split(/[,\s]+/).map((item) => item.replace(/^#/, '').trim()).filter(Boolean)
  }
  return []
}

function isSafeFrontmatterKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(key)
}

function sanitizeFrontmatterValue(value: unknown): unknown {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
      .slice(0, 50)
  }
  return String(value)
}

function normalizeWikiTarget(value: string): string {
  const trimmed = value.trim().replace(/\\/g, '/').replace(/\.md$/i, '')
  return basename(trimmed, extname(trimmed)) || trimmed
}

function hasWikiLinkTo(content: string, target: string): boolean {
  const normalizedTarget = normalizeWikiTarget(target)
  const pattern = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content))) {
    if (normalizeWikiTarget(match[1]) === normalizedTarget) return true
  }
  return false
}

function buildMergedNoteContent(sources: { relPath: string; absPath: string }[], targetRel: string, previousTargetContent: string | null): string {
  const parts: string[] = []
  if (previousTargetContent?.trim()) parts.push(previousTargetContent.trim())
  for (const source of sources) {
    const content = readFileSync(source.absPath, 'utf-8').trim()
    if (!content) continue
    if (source.relPath === targetRel && previousTargetContent !== null) continue
    parts.push([`## From ${source.relPath}`, '', content].join('\n'))
  }
  return `${parts.join('\n\n')}\n`
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

function hashContentSha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

function contentMatchesStoredHash(content: string, expectedHash: string): boolean {
  return hashContent(content) === expectedHash || hashContentSha256(content) === expectedHash
}

export function isWriteStep(kind: AgentStepKind): boolean {
  return isWriteStepKind(kind)
}
