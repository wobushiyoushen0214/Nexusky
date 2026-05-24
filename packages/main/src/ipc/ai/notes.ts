import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, basename } from 'path'
import { aiManager } from '../../services/ai'
import { getErrorMessage as getErrorMessageShared } from '@shared/utils/errors'
import { startAiTask, finishAiTask } from '../../services/ai-task-control'
import { consumeStream } from '../streams/consume-stream'
import { extractJsonFromText } from '../../services/ai/json'
import { normalizeGeneratedNoteBatchPlan, normalizeGeneratedNotePlan } from '../../services/ai/note-plan'
import { buildGeneratedNoteSystemPrompt, buildGeneratedNoteUserPrompt, ensureGeneratedNoteMetadata, ensureGeneratedNoteWikilinks } from '../../services/ai/note-writing'
import { indexNote, resolveAllLinks } from '../../services/indexer'
import { getDatabase } from '../../services/database'
import { generateMemory, readMemory, findRelatedByMemory } from '../../services/memory'
import { findSimilarNotes } from '../../services/embedding'
import { logger } from '../../services/logger'

function getErrorMessage(error: unknown): string {
  return getErrorMessageShared(error)
}

export function registerAiNotesHandlers(): void {
ipcMain.handle('ai:plan-note-batches', async (event, params: { instruction: string; existingDirs?: string[] }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在', batches: [] }

  const config = aiManager.getActiveConfig()
  if (!config) return { success: false, error: '未配置 AI 提供商', batches: [] }
  const configError = aiManager.validateConfig(config)
  if (configError) return { success: false, error: configError, batches: [] }

  const windowId = window.id
  const controller = startAiTask(windowId)
  const provider = aiManager.getProvider(config)
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
6. 只输出 JSON，不要解释。` },
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

ipcMain.handle('ai:generate-notes', async (event, params: { instruction: string; vaultPath: string; targetDir?: string; requestId?: number }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在', files: [] }

  const config = aiManager.getActiveConfig()
  if (!config) return { success: false, error: '未配置 AI 提供商', files: [] }
  const configError = aiManager.validateConfig(config)
  if (configError) return { success: false, error: configError, files: [] }

  const windowId = window.id
  const controller = startAiTask(windowId)
  const sendProgress = (data: { stage: string; message: string; plan?: { title: string; brief?: string }[]; current?: number; total?: number }) => {
    window.webContents.send('ai:generate-notes-progress', { requestId: params.requestId, ...data })
  }

  const provider = aiManager.getProvider(config)

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
[{"title":"React Hooks 入门","brief":"介绍 useState、useEffect 等基础 Hook"},{"title":"自定义 Hook","brief":"如何封装可复用的自定义 Hook"}]` },
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
  for (let i = 0; i < plan.length; i++) {
    if (controller.signal.aborted) break
    const item = plan[i]
    sendProgress({ stage: 'generating', message: `正在生成 (${i + 1}/${plan.length}): ${item.title}`, current: i + 1, total: plan.length })

    let noteContent = ''
    const siblingTitles = safeNames.filter((_, j) => j !== i)
    try {
      const { text } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: buildGeneratedNoteSystemPrompt() },
          { role: 'user', content: buildGeneratedNoteUserPrompt(safeNames[i], item.brief, siblingTitles) }
        ], controller.signal),
        { signal: controller.signal }
      )
      noteContent = text
    } catch { continue }

    if (noteContent.trim() && !controller.signal.aborted) {
      const filePath = join(targetDir, `${safeNames[i]}.md`)
      try {
        const linkedContent = ensureGeneratedNoteWikilinks(noteContent, safeNames[i], siblingTitles)
        writeFileSync(filePath, ensureGeneratedNoteMetadata(linkedContent, safeNames[i], item.brief, siblingTitles), 'utf-8')
        createdFiles.push(filePath)
      } catch {}
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

    // Step 4: AI-powered semantic link inference
    if (createdFiles.length >= 2 && !controller.signal.aborted) {
      sendProgress({ stage: 'indexing', message: '正在分析笔记语义关系...' })
      try {
        const noteSummaries = createdFiles.map((fp) => {
          const content = readFileSync(fp, 'utf-8')
          const name = basename(fp, '.md')
          return `[${name}]\n${content.slice(0, 500)}`
        }).join('\n\n---\n\n')

        const { text: relResult } = await consumeStream(
          provider.chatStream([
            { role: 'system', content: `你是一个知识图谱分析助手。分析以下笔记的内容，找出它们之间的语义关系。

输出格式为 JSON 数组，每项包含：
- source: 源笔记标题（必须与给定标题完全一致）
- target: 目标笔记标题（必须与给定标题完全一致）
- reason: 一句话说明关系原因

规则：
1. 只输出真正有内容关联的关系，不要为了凑数而强行关联
2. 关系应基于概念相关性、因果关系、层级关系等语义理解
3. 不要输出自引用（source 和 target 相同）
4. 只输出 JSON，不要其他文字` },
            { role: 'user', content: `以下是 ${createdFiles.length} 篇笔记，请分析它们之间的语义关系：\n\n${noteSummaries}` }
          ], controller.signal),
          { signal: controller.signal }
        )

        if (relResult.trim()) {
          const relations = extractJsonFromText<{ source: string; target: string; reason: string }[]>(relResult, 'array')
          if (Array.isArray(relations)) {
            const db = getDatabase(params.vaultPath)
            const insertLink = db.prepare('INSERT INTO links (source_note_id, target_title, context, link_type) VALUES (?, ?, ?, ?)')
            const findNote = db.prepare('SELECT id FROM notes WHERE title = ?')

            for (const rel of relations) {
              const sourceNote = findNote.get(rel.source) as { id: string } | undefined
              if (sourceNote && rel.target && rel.source !== rel.target) {
                const existing = db.prepare('SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ?').get(sourceNote.id, rel.target)
                if (!existing) {
                  insertLink.run(sourceNote.id, rel.target, rel.reason || '', 'inferred')
                }
              }
            }
            try { resolveAllLinks(params.vaultPath) } catch {}
          }
        }
      } catch (e) {
        logger.error('semantic-links failed', e)
      }
    }

    window.webContents.send('vault:files-changed')
    if (indexErr) {
      sendProgress({ stage: 'index-error', message: `索引失败: ${indexErr}` })
    }
  }

  const aborted = controller.signal.aborted
  finishAiTask(windowId, controller)
  sendProgress({ stage: 'done', message: aborted ? `已停止，已生成 ${createdFiles.length} 个文件` : `完成！已生成 ${createdFiles.length} 个文件` })
  return { success: !aborted, error: aborted ? '已取消' : undefined, files: createdFiles }
})

ipcMain.handle('ai:infer-links', async (event, params: { vaultPath: string; filePaths: string[] }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在' }

  const config = aiManager.getActiveConfig()
  if (!config) return { success: false, error: '未配置 AI 提供商' }
  const configError = aiManager.validateConfig(config)
  if (configError) return { success: false, error: configError }

  const filePaths = params.filePaths.slice(0, 50)
  const db = getDatabase(params.vaultPath)

  const noteSummaries = filePaths.map((fp) => {
    try {
      const content = readFileSync(fp, 'utf-8')
      const name = basename(fp, '.md')
      return `[${name}]\n${content.slice(0, 600)}`
    } catch { return null }
  }).filter(Boolean).join('\n\n---\n\n')

  if (!noteSummaries) return { success: false, error: '无法读取文件内容' }

  const provider = aiManager.getProvider(config)

  try {
    const { text: relResult, errorChunk } = await consumeStream(
      provider.chatStream([
        { role: 'system', content: `你是一个知识图谱分析助手。分析以下笔记的内容，找出它们之间的语义关系。

输出格式为 JSON 数组，每项包含：
- source: 源笔记标题（必须与给定标题完全一致）
- target: 目标笔记标题（必须与给定标题完全一致）
- reason: 一句话说明关系原因（如"都涉及状态管理"、"A是B的前置知识"等）

规则：
1. 只输出真正有内容关联的关系，不要为了凑数而强行关联
2. 关系应基于概念相关性、因果关系、层级关系、共同主题等语义理解
3. 不要输出自引用（source 和 target 相同）
4. 只输出 JSON，不要其他文字` },
        { role: 'user', content: `以下是 ${filePaths.length} 篇笔记，请分析它们之间的语义关系：\n\n${noteSummaries}` }
      ]),
      { window }
    )
    if (errorChunk !== null) return { success: false, error: errorChunk || 'AI 返回错误' }

    if (!relResult.trim()) return { success: false, error: 'AI 未返回结果' }

    const relations = extractJsonFromText<{ source: string; target: string; reason: string }[]>(relResult, 'array')
    if (!Array.isArray(relations)) return { success: false, error: '解析失败' }

    const insertLink = db.prepare('INSERT INTO links (source_note_id, target_title, context, link_type) VALUES (?, ?, ?, ?)')
    const findNote = db.prepare('SELECT id FROM notes WHERE title = ?')
    let added = 0

    for (const rel of relations) {
      const sourceNote = findNote.get(rel.source) as { id: string } | undefined
      if (sourceNote && rel.target && rel.source !== rel.target) {
        const existing = db.prepare('SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ?').get(sourceNote.id, rel.target)
        if (!existing) {
          insertLink.run(sourceNote.id, rel.target, rel.reason || '', 'inferred')
          added++
        }
      }
    }
    try { resolveAllLinks(params.vaultPath) } catch {}

    return { success: true, added }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
})

// --- Global cross-group semantic link inference ---
ipcMain.handle('ai:infer-global-links', async (event, params: { vaultPath: string }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在' }

  const controller = startAiTask(window.id)
  const db = getDatabase(params.vaultPath)
  const insertLink = db.prepare('INSERT INTO links (source_note_id, target_title, context, link_type) VALUES (?, ?, ?, ?)')
  const explicitLinkExists = db.prepare("SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ? AND link_type = 'explicit'")
  const anyLinkExists = db.prepare('SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ?')
  const inferredLinks: { sourceId: string; targetId?: string; targetTitle: string; sourceTitle?: string; context: string }[] = []
  const pendingKeys = new Set<string>()

  const queueInferredLink = (pair: { sourceId: string; targetId?: string; sourceTitle?: string; targetTitle: string; context: string }, checkAnyLink: boolean) => {
    const exists = checkAnyLink ? anyLinkExists : explicitLinkExists
    if (exists.get(pair.sourceId, pair.targetTitle)) return
    if (pair.targetId && pair.sourceTitle && exists.get(pair.targetId, pair.sourceTitle)) return

    const key = `${pair.sourceId}\u0000${pair.targetTitle}`
    const reverseKey = pair.targetId && pair.sourceTitle ? `${pair.targetId}\u0000${pair.sourceTitle}` : ''
    if (pendingKeys.has(key) || (reverseKey && pendingKeys.has(reverseKey))) return

    pendingKeys.add(key)
    inferredLinks.push(pair)
  }

  try {
    // Phase 1: Memory-based relation (preferred — uses pre-generated memory files)
    const memoryPairs = findRelatedByMemory(params.vaultPath, 3)
    for (const pair of memoryPairs) {
      if (controller.signal.aborted) return { success: false, error: '已取消' }
      queueInferredLink({
        sourceId: pair.sourceId,
        targetId: pair.targetId,
        sourceTitle: pair.sourceTitle,
        targetTitle: pair.targetTitle,
        context: pair.reason
      }, false)
    }

    // Phase 2: TF-IDF fallback (for notes without memory files)
    const similarPairs = findSimilarNotes(params.vaultPath, 3, 0.75)
    for (const pair of similarPairs) {
      if (controller.signal.aborted) return { success: false, error: '已取消' }
      queueInferredLink({
        sourceId: pair.sourceId,
        targetId: pair.targetId,
        sourceTitle: pair.sourceTitle,
        targetTitle: pair.targetTitle,
        context: `相似度: ${(pair.score * 100).toFixed(0)}%`
      }, true)
    }

    const replaceInferredLinks = db.transaction(() => {
      db.prepare("DELETE FROM links WHERE link_type = 'inferred'").run()
      for (const link of inferredLinks) {
        insertLink.run(link.sourceId, link.targetTitle, link.context, 'inferred')
      }
    })
    replaceInferredLinks()

    try { resolveAllLinks(params.vaultPath) } catch {}
    return { success: true, added: inferredLinks.length }
  } finally {
    finishAiTask(window.id, controller)
  }
})

ipcMain.handle('ai:generate-memories', async (event, params: { vaultPath: string }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return { success: false, error: '窗口不存在' }
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
      const result = await generateMemory(params.vaultPath, note.id, note.title, note.file_path, content, note.content_hash, controller.signal)
      if (controller.signal.aborted) return { success: false, error: '已取消', generated, skipped, failed, total: notes.length, totalNotes, limited: totalNotes > notes.length }
      if (result) generated++
      else failed++
      sendProgress(i + 1, note.title)
    }

    sendProgress(notes.length, undefined, 'done')
    return { success: true, generated, skipped, failed, total: notes.length, totalNotes, limited: totalNotes > notes.length }
  } finally {
    finishAiTask(window.id, controller)
  }
})
}
