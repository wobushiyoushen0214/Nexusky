import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, relative } from 'path'
import { aiManager } from '../../services/ai'
import { getAppLanguage } from '../../services/app-language'
import { getErrorMessage as getErrorMessageShared } from '@shared/utils/errors'
import { startAiTask, finishAiTask } from '../../services/ai-task-control'
import { consumeStream } from '../streams/consume-stream'
import { extractJsonFromText } from '../../services/ai/json'
import { normalizeGeneratedNoteBatchPlan, normalizeGeneratedNotePlan } from '../../services/ai/note-plan'
import { buildGeneratedNoteSystemPrompt, buildGeneratedNoteUserPrompt, ensureGeneratedNoteMetadata } from '../../services/ai/note-writing'
import { buildGenerateNotesCompletion, formatGenerateNotesDoneMessage, type GeneratedNoteFailure, type GeneratedNoteFailureStage } from '../../services/ai/generate-notes-result'
import { indexNote, resolveAllLinks } from '../../services/indexer'
import { getDatabase } from '../../services/database'
import { refreshInferredLinksFromMemory } from '../../services/memory-links'
import { generateMemory, readMemory } from '../../services/memory'
import { logger } from '../../services/logger'
import { resolveAppLanguage } from '../../services/app-language'
import { getJsonValueLanguageInstruction } from '../../services/ai/language'
import type { AppLanguage } from '@shared/types/ipc'

function getErrorMessage(error: unknown): string {
  return getErrorMessageShared(error)
}

export function registerAiNotesHandlers(): void {
ipcMain.handle('ai:plan-note-batches', async (event, params: { instruction: string; existingDirs?: string[]; language?: AppLanguage }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在', batches: [] }

  const config = aiManager.getActiveConfig()
  if (!config) return { success: false, error: '未配置 AI 提供商', batches: [] }
  const configError = aiManager.validateConfig(config)
  if (configError) return { success: false, error: configError, batches: [] }

  const windowId = window.id
  const controller = startAiTask(windowId)
  const provider = aiManager.getProvider(config)
  const language = resolveAppLanguage(params.language)
  const existingDirs = (params.existingDirs || []).filter((dir) => typeof dir === 'string' && dir.trim()).slice(0, 100)

  let planResult = ''
  try {
    const { text, errorChunk } = await consumeStream(
      provider.chatStream([
        { role: 'system', content: `你是批量笔记创建前的语义规划助手。请先理解用户想生成哪些主题目录，而不是让用户手动选择目录。

输出 JSON 数组，每项包含：
- dir: 目录名，简短安全，不含文件名后缀；可复用 existingDirs 中语义匹配的目录名
- topic: 该目录的主题
- count: 该目录需要生成的笔记数量

规则：
1. 如果用户要求“10 种框架/工具/主题，每种 5-8 篇”，你必须推断并列出 10 个不同目录，count 必须落在 5-8 之间。
2. 如果用户指定数量范围但未指定精确值，选择范围内一个合理整数，优先选择 6。
3. 如果用户没有给每个目录的数量，默认每个目录 5 篇。
4. 如果用户明确说放在不同目录中，不要返回单个总目录。
5. 目录名应是主题本身，例如 React、Vue、Laravel、Django；不要使用“开发框架 1”这类占位名。
6. 只输出 JSON，不要解释。
${getJsonValueLanguageInstruction(language)}` },
        { role: 'user', content: `已有目录（可复用，不必强制使用）：\n${existingDirs.length > 0 ? existingDirs.map((dir) => `- ${dir}`).join('\n') : '(无)'}\n\n用户请求：\n${params.instruction}` }
      ], controller.signal),
      { signal: controller.signal }
    )
    planResult = text
    if (errorChunk !== null) {
      finishAiTask(windowId, controller)
      return { success: false, error: errorChunk, batches: [] }
    }
  } catch (err: unknown) {
    finishAiTask(windowId, controller)
    return { success: false, error: controller.signal.aborted ? '已取消' : getErrorMessage(err), batches: [] }
  }

  if (controller.signal.aborted) {
    finishAiTask(windowId, controller)
    return { success: false, error: '已取消', batches: [] }
  }

  try {
    const parsed = extractJsonFromText<{ batches?: unknown } | unknown[]>(planResult)
    const parsedPlan = Array.isArray(parsed) ? parsed : parsed.batches
    if (!Array.isArray(parsedPlan)) throw new Error('empty')
    const batches = normalizeGeneratedNoteBatchPlan(parsedPlan as { dir: string; topic: string; count: number }[])
    if (batches.length === 0) throw new Error('empty')
    return { success: true, batches }
  } catch {
    return { success: false, error: '批量目录规划解析失败', batches: [] }
  } finally {
    finishAiTask(windowId, controller)
  }
})

ipcMain.handle('ai:generate-notes', async (event, params: { instruction: string; vaultPath: string; targetDir?: string; requestId?: number; language?: AppLanguage }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在', files: [] }

  const config = aiManager.getActiveConfig()
  if (!config) return { success: false, error: '未配置 AI 提供商', files: [] }
  const configError = aiManager.validateConfig(config)
  if (configError) return { success: false, error: configError, files: [] }

  const windowId = window.id
  const controller = startAiTask(windowId)
  const sendProgress = (data: { stage: string; message: string; plan?: { title: string; brief?: string }[]; current?: number; total?: number; created?: number; failed?: number; failedItems?: GeneratedNoteFailure[] }) => {
    window.webContents.send('ai:generate-notes-progress', { requestId: params.requestId, ...data })
  }

  const provider = aiManager.getProvider(config)
  const language = resolveAppLanguage(params.language)

  // Step 1: Ask AI to plan the notes
  sendProgress({ stage: 'planning', message: '正在规划笔记结构...' })

  let planResult = ''
  try {
    const { text, errorChunk } = await consumeStream(
      provider.chatStream([
        { role: 'system', content: `你是一个笔记规划助手。用户会给你一个主题，请规划需要创建的笔记列表。
输出格式为 JSON 数组，每项包含 title（文件标题）和 brief（一句话描述内容方向）。
重要：title 是纯笔记标题，绝对不要包含目录名、路径前缀或分类前缀（例如不要写"react/Hooks入门"或"reactHooks入门"，直接写"Hooks入门"）。
只输出 JSON，不要其他文字。示例：
[{"title":"React Hooks 入门","brief":"介绍 useState、useEffect 等基础 Hook"},{"title":"自定义 Hook","brief":"如何封装可复用的自定义 Hook"}]
${getJsonValueLanguageInstruction(language)}` },
        { role: 'user', content: params.instruction }
      ], controller.signal),
      { signal: controller.signal }
    )
    planResult = text
    if (errorChunk !== null) { finishAiTask(windowId, controller); return { success: false, error: errorChunk, files: [] } }
  } catch (err: unknown) {
    finishAiTask(windowId, controller)
    return { success: false, error: controller.signal.aborted ? '已取消' : getErrorMessage(err), files: [] }
  }

  if (controller.signal.aborted) { finishAiTask(windowId, controller); return { success: false, error: '已取消', files: [] } }

  let plan: { title: string; brief: string }[]
  try {
    const parsed = extractJsonFromText<{ notes?: unknown } | unknown[]>(planResult)
    const parsedPlan = Array.isArray(parsed) ? parsed : parsed.notes
    if (!Array.isArray(parsedPlan)) throw new Error('empty')
    plan = parsedPlan as { title: string; brief: string }[]
    if (!Array.isArray(plan) || plan.length === 0) throw new Error('empty')
  } catch {
    finishAiTask(windowId, controller)
    return { success: false, error: '规划解析失败，请重试', files: [] }
  }

  const targetDir = params.targetDir || params.vaultPath
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  const dirName = targetDir === params.vaultPath ? '根目录' : targetDir.split(/[\\/]/).pop() || ''

  plan = normalizeGeneratedNotePlan(plan, {
    dirName,
    isNameTaken: (title) => existsSync(join(targetDir, `${title}.md`))
  })

  sendProgress({ stage: 'planned', message: `将在「${dirName}」下生成 ${plan.length} 篇笔记`, plan })

  // Pre-compute safe file names for consistent wikilinks
  const safeNames = plan.map((p) => p.title)

  // Step 2: Generate each note
  const createdFiles: string[] = []
  const failedItems: GeneratedNoteFailure[] = []
  const recordFailure = (item: { title: string }, stage: GeneratedNoteFailureStage, error: string, index: number) => {
    const failure: GeneratedNoteFailure = { title: item.title, stage, error: getErrorMessage(error) }
    failedItems.push(failure)
    logger.warn('Generated note failed', { title: item.title, stage, error: failure.error })
    sendProgress({
      stage: 'note-error',
      message: `生成失败 (${index + 1}/${plan.length}): ${item.title}`,
      current: index + 1,
      total: plan.length,
      created: createdFiles.length,
      failed: failedItems.length,
      failedItems: [failure]
    })
  }
  for (let i = 0; i < plan.length; i++) {
    if (controller.signal.aborted) break
    const item = plan[i]
    sendProgress({ stage: 'generating', message: `正在生成 (${i + 1}/${plan.length}): ${item.title}`, current: i + 1, total: plan.length })

    let noteContent = ''
    const siblingTitles = safeNames.filter((_, j) => j !== i)
    try {
      const { text, errorChunk } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: buildGeneratedNoteSystemPrompt(language) },
          { role: 'user', content: buildGeneratedNoteUserPrompt(safeNames[i], item.brief, siblingTitles) }
        ], controller.signal),
        { signal: controller.signal }
      )
      if (controller.signal.aborted) break
      if (errorChunk !== null) {
        recordFailure(item, 'generate', errorChunk, i)
        continue
      }
      noteContent = text
    } catch (e: unknown) {
      if (controller.signal.aborted) break
      recordFailure(item, 'generate', getErrorMessage(e), i)
      continue
    }

    if (!noteContent.trim()) {
      recordFailure(item, 'generate', 'empty_content', i)
      continue
    }
    if (!controller.signal.aborted) {
      const filePath = join(targetDir, `${safeNames[i]}.md`)
      try {
        writeFileSync(filePath, ensureGeneratedNoteMetadata(noteContent, safeNames[i], item.brief, siblingTitles), 'utf-8')
        createdFiles.push(filePath)
      } catch (e: unknown) {
        recordFailure(item, 'write', getErrorMessage(e), i)
      }
    }
  }

  // Step 3: Index all generated files and infer semantic relationships
  if (createdFiles.length > 0) {
    sendProgress({ stage: 'indexing', message: '正在索引笔记关系...' })
    let indexErr: string | null = null
    for (const fp of createdFiles) {
      try { indexNote(params.vaultPath, fp) } catch (e: unknown) {
        if (!indexErr) indexErr = getErrorMessage(e)
        logger.error('indexNote failed', e, { file: fp })
      }
    }
    try { resolveAllLinks(params.vaultPath) } catch {}

    // Step 4: Store AI note memories, then derive semantic graph links from memory.
    if (createdFiles.length > 0 && !controller.signal.aborted) {
      sendProgress({ stage: 'indexing', message: '正在生成笔记记忆...' })
      try {
        const db = getDatabase(params.vaultPath)
        const findNoteByPath = db.prepare('SELECT id, title, file_path, content_hash FROM notes WHERE file_path = ?')
        for (const fp of createdFiles) {
          if (controller.signal.aborted) break
          const relPath = relative(params.vaultPath, fp).replace(/\\/g, '/')
          const note = findNoteByPath.get(relPath) as { id: string; title: string; file_path: string; content_hash: string } | undefined
          if (!note) continue
          const content = readFileSync(fp, 'utf-8')
          await generateMemory(params.vaultPath, note.id, note.title, note.file_path, content, note.content_hash, params.language, controller.signal)
        }

        if (!controller.signal.aborted) {
          sendProgress({ stage: 'indexing', message: '正在读取记忆分析关系...' })
          refreshInferredLinksFromMemory(params.vaultPath, { signal: controller.signal })
        }
      } catch (e) {
        logger.error('memory-links failed', e)
      }
    }

    window.webContents.send('vault:files-changed')
    if (indexErr) {
      sendProgress({ stage: 'index-error', message: `索引失败: ${indexErr}` })
    }
  }

  const aborted = controller.signal.aborted
  const completion = buildGenerateNotesCompletion({ aborted, files: createdFiles, total: plan.length, failedItems })
  finishAiTask(windowId, controller)
  sendProgress({
    stage: 'done',
    message: formatGenerateNotesDoneMessage(completion),
    created: createdFiles.length,
    failed: completion.failed,
    total: completion.total,
    failedItems: completion.failedItems
  })
  return completion
})

ipcMain.handle('ai:infer-links', async (event, params: { vaultPath: string; filePaths: string[] }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在' }

  const config = aiManager.getActiveConfig()
  if (!config) return { success: false, error: '未配置 AI 提供商' }
  const configError = aiManager.validateConfig(config)
  if (configError) return { success: false, error: configError }

  try {
    const db = getDatabase(params.vaultPath)
    const findNoteByPath = db.prepare('SELECT id, title, file_path, content_hash FROM notes WHERE file_path = ?')
    for (const fp of params.filePaths.slice(0, 50)) {
      const relPath = relative(params.vaultPath, fp).replace(/\\/g, '/')
      const note = findNoteByPath.get(relPath) as { id: string; title: string; file_path: string; content_hash: string } | undefined
      if (!note) continue
      const existing = readMemory(params.vaultPath, note.id)
      if (existing && existing.contentHash === note.content_hash) continue
      const content = readFileSync(fp, 'utf-8')
      await generateMemory(params.vaultPath, note.id, note.title, note.file_path, content, note.content_hash, getAppLanguage())
    }

    const result = refreshInferredLinksFromMemory(params.vaultPath)
    return { success: true, added: result.added }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
})

// Kept for backward compatibility with older renderer builds. Current graph
// inference is memory-backed, not TF-IDF-backed.
ipcMain.handle('db:auto-infer-tfidf-links', async (_event, params: { vaultPath: string; force?: boolean }) => {
  try {
    const result = refreshInferredLinksFromMemory(params.vaultPath)
    return { success: true, added: result.added, skipped: result.considered === 0 }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
})

// --- Global cross-group semantic link inference ---
ipcMain.handle('ai:infer-global-links', async (event, params: { vaultPath: string }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在' }

  const controller = startAiTask(window.id)
  try {
    const result = refreshInferredLinksFromMemory(params.vaultPath, { signal: controller.signal })
    if (result.aborted) return { success: false, error: '已取消' }
    return { success: true, added: result.added }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  } finally {
    finishAiTask(window.id, controller)
  }
})

ipcMain.handle('ai:generate-memories', async (event, params: { vaultPath: string }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在' }
  const config = aiManager.getActiveConfig()
  if (!config) return { success: false, error: '未配置 AI 提供商', generated: 0, skipped: 0, failed: 0, total: 0 }
  const configError = aiManager.validateConfig(config)
  if (configError) return { success: false, error: configError, generated: 0, skipped: 0, failed: 0, total: 0 }
  const controller = startAiTask(window.id)
  const db = getDatabase(params.vaultPath)
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number }
  const notes = db.prepare(`
    SELECT n.id, n.title, n.file_path, n.content_hash
    FROM notes n ORDER BY n.updated_at DESC LIMIT 200
  `).all() as { id: string; title: string; file_path: string; content_hash: string }[]
  const totalNotes = totalRow.count || notes.length

  let generated = 0
  let skipped = 0
  let failed = 0
  const sendProgress = (current: number, title: string | undefined, state: 'running' | 'done' = 'running') => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('ai:memory-progress', { current, total: notes.length, generated, skipped, failed, title, state })
    }
  }
  sendProgress(0, undefined)

  try {
    for (let i = 0; i < notes.length; i++) {
      if (controller.signal.aborted) return { success: false, error: '已取消', generated, skipped, failed, total: notes.length, totalNotes, limited: totalNotes > notes.length }
      const note = notes[i]
      const existing = readMemory(params.vaultPath, note.id)
      if (existing && existing.contentHash === note.content_hash) {
        skipped++
        sendProgress(i + 1, note.title)
        continue
      }

      const fullPath = join(params.vaultPath, note.file_path)
      if (!existsSync(fullPath)) {
        failed++
        sendProgress(i + 1, note.title)
        continue
      }

      const content = readFileSync(fullPath, 'utf-8')
      const result = await generateMemory(params.vaultPath, note.id, note.title, note.file_path, content, note.content_hash, getAppLanguage(), controller.signal)
      if (controller.signal.aborted) return { success: false, error: '已取消', generated, skipped, failed, total: notes.length, totalNotes, limited: totalNotes > notes.length }
      if (result) generated++
      else failed++
      sendProgress(i + 1, note.title)
    }

    if (!controller.signal.aborted) {
      try { refreshInferredLinksFromMemory(params.vaultPath, { signal: controller.signal }) } catch {}
    }
    sendProgress(notes.length, undefined, 'done')
    return { success: true, generated, skipped, failed, total: notes.length, totalNotes, limited: totalNotes > notes.length }
  } finally {
    finishAiTask(window.id, controller)
  }
})
}
