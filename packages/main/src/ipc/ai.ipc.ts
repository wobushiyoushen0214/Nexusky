import { ipcMain, BrowserWindow } from 'electron'
import { aiManager, ChatMessage, ToolCallEvent } from '../services/ai'
import { store } from '../services/store'
import { semanticSearch, findSimilarNotes } from '../services/embedding'
import { extractJsonFromText } from '../services/ai/json'
import { normalizeGeneratedNoteBatchPlan, normalizeGeneratedNotePlan } from '../services/ai/note-plan'
import { buildGeneratedNoteSystemPrompt, buildGeneratedNoteUserPrompt, ensureGeneratedNoteMetadata, ensureGeneratedNoteWikilinks } from '../services/ai/note-writing'
import { parseToolArguments } from '../services/ai/tool-arguments'
import { withMergedSystemContext } from '../services/ai/system-context'
import { buildLongContextPack, mergeLongContextIntoSystemPrompt, type LongContextPack } from '../services/long-context/context-pack-builder'
import { logger } from '../services/logger'
import { indexNote, resolveAllLinks } from '../services/indexer'
import { getDatabase } from '../services/database'
import { generateMemory, readMemory, findRelatedByMemory } from '../services/memory'
import { abortAiTask, finishAiTask, startAiTask } from '../services/ai-task-control'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { analyzeWritingStyle, formatWritingStylePrompt } from '@shared/writing-style'
import { getErrorMessage as getErrorMessageShared } from '@shared/utils/errors'
import { setAgentToolRunner } from '../services/agent/tool-runner'
import { consumeStream } from './streams/consume-stream'
import { AGENT_TOOLS } from './tools/agent-tools'
import { executeToolCall } from './tools/execute-tool-call'
import { registerAiProviderHandlers } from './ai/provider'
import { registerAiTextToolHandlers } from './ai/text-tools'
import { registerAiEditHandlers } from './ai/edit'
import type { ChatSource } from '@shared/types/ipc'

function getErrorMessage(error: unknown): string {
  return getErrorMessageShared(error)
}

function mergeChatSources(...groups: (ChatSource[] | undefined)[]): ChatSource[] {
  const sources: ChatSource[] = []
  for (const group of groups) {
    for (const source of group || []) {
      if (sources.some((item) => item.filePath === source.filePath && item.title === source.title)) continue
      sources.push(source)
    }
  }
  return sources
}

function buildLongContextPackSafely(vaultPath?: string, currentFilePath?: string | null): LongContextPack | null {
  if (!vaultPath) return null
  try {
    return buildLongContextPack({ vaultPath, currentFilePath })
  } catch (error) {
    logger.warn('Failed to build long-context pack', { error: getErrorMessage(error) })
    return null
  }
}


export function registerAiIPC(): void {
  registerAiProviderHandlers()
  registerAiTextToolHandlers()
  registerAiEditHandlers()

  ipcMain.handle('ai:detect-intent', async (event, params: { messages: ChatMessage[]; intents?: string[]; intentContext?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { intent: 'chat' }
    const controller = startAiTask(window.id)
    const intents = params.intents && params.intents.length > 0 ? params.intents : ['chat']
    const descriptions: Record<string, string> = {
      graph: 'user wants to generate a knowledge graph or visualize note relationships',
      kanban: 'user wants to extract tasks, create a kanban board, or manage todos from notes',
      batch: 'user wants to generate multiple separate note files',
      edit: 'user wants to modify or create a single note file',
      chat: 'normal conversation, Q&A, explanation, or anything else'
    }
    const tagList = intents.map((intent) => `- ${intent}: ${descriptions[intent] || intent}`).join('\n')
    const systemPrompt = `Classify the user's latest intent.

Available intents:
${tagList}

${params.intentContext || ''}

Output exactly one intent name from the list. No punctuation, no explanation.`

    let result = ''
    try {
      const recentMessages = params.messages.filter((m) => m.role !== 'system').slice(-8)
      const clientContextMessages = params.messages.filter((m) => m.role === 'system')
      const { text } = await consumeStream(
        aiManager.chat([
          ...withMergedSystemContext(systemPrompt, [...clientContextMessages, ...recentMessages])
        ], controller.signal),
        { signal: controller.signal }
      )
      result = text
      if (controller.signal.aborted) throw new Error('已取消')
    } catch (err) {
      if (controller.signal.aborted) throw err
    } finally {
      finishAiTask(window.id, controller)
    }

    const normalized = result.trim().toLowerCase().replace(/[^a-z_-]/g, '')
    const intent = intents.includes(normalized) ? normalized : 'chat'
    return { intent }
  })

  ipcMain.handle('ai:chat', async (event, params: { messages: ChatMessage[]; vaultPath?: string; systemPrompt?: string; currentFilePath?: string | null }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    const windowId = window.id
    const controller = startAiTask(windowId)

    let messages = [...params.messages]
    const longContextPack = buildLongContextPackSafely(params.vaultPath, params.currentFilePath)

    if (params.vaultPath) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      if (lastUserMsg) {
        const queryText = typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content
          : lastUserMsg.content.filter((p) => p.type === 'text').map((p) => p.text).join(' ')
        const results = await semanticSearch(params.vaultPath, queryText, 5)
        if (results.length > 0) {
          const context = results.map((r, i) => `[^${i + 1}] ${r.title}\n${r.chunk}`).join('\n\n---\n\n')
          const systemContent = params.systemPrompt || `You are the user's personal knowledge base assistant. Answer questions based on retrieved note content. Respond in the same language as the user's question.

<response_strategy>
- Direct answer found in notes: cite and answer, mark sources with [^n]
- Multiple notes complement each other: synthesize a complete answer, cite each source separately
- Notes contain conflicting views: highlight the discrepancy, list each perspective with its source, let the user decide
- No relevant information in notes: explicitly state "no relevant content found in notes", then supplement with general knowledge
</response_strategy>

<format>
- Use [^n] citation format corresponding to note numbers below
- Be concise and direct — do not repeat large blocks of note content verbatim
- For factual questions, give the precise answer rather than a vague overview
</format>

Retrieved notes:
---
${context}
---`
          const systemMsg: ChatMessage = {
            role: 'system',
            content: params.systemPrompt
              ? `${params.systemPrompt}\n\n以下是相关笔记内容：\n---\n${context}\n---`
              : systemContent
          }
          messages = withMergedSystemContext(mergeLongContextIntoSystemPrompt(String(systemMsg.content), longContextPack), messages)

          const semanticSources = results.map((r) => ({
            title: r.title,
            filePath: r.filePath,
            chunk: r.chunk.slice(0, 100),
            score: r.score
          }))
          window.webContents.send('ai:sources', mergeChatSources(longContextPack?.sources, semanticSources))
        } else if (params.systemPrompt) {
          messages = withMergedSystemContext(mergeLongContextIntoSystemPrompt(params.systemPrompt, longContextPack), messages)
          if (longContextPack?.sources.length) window.webContents.send('ai:sources', longContextPack.sources)
        } else if (longContextPack?.systemText) {
          messages = withMergedSystemContext(mergeLongContextIntoSystemPrompt('You are the user\'s personal knowledge base assistant. Use the long-term context only when it helps answer the current question.', longContextPack), messages)
          if (longContextPack.sources.length) window.webContents.send('ai:sources', longContextPack.sources)
        }
      }
    } else if (params.systemPrompt) {
      messages = withMergedSystemContext(params.systemPrompt, messages)
    }

    try {
      await consumeStream(
        aiManager.chat(messages, controller.signal),
        {
          signal: controller.signal,
          window,
          breakOnError: false,
          onChunk: (chunk) => window.webContents.send('ai:stream', chunk)
        }
      )
    } catch (err: unknown) {
      if (!window.isDestroyed() && !controller.signal.aborted) {
        window.webContents.send('ai:stream', { type: 'error', content: getErrorMessage(err) })
      }
    } finally {
      if (!window.isDestroyed() && !controller.signal.aborted) {
        window.webContents.send('ai:stream', { type: 'done', content: '' })
      }
      finishAiTask(windowId, controller)
    }
  })

  ipcMain.handle('ai:stop', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    abortAiTask(window.id)
  })

  const completeAbortControllers: Map<string, AbortController> = new Map()
  const getCompleteTaskKey = (windowId: number | undefined, taskKey?: string) => {
    return `${windowId ?? 'global'}:${taskKey || 'default'}`
  }

  ipcMain.handle('ai:complete-abort', (event, params?: { taskKey?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const taskKey = getCompleteTaskKey(window?.id, params?.taskKey)
    const controller = completeAbortControllers.get(taskKey)
    if (controller) {
      controller.abort()
      completeAbortControllers.delete(taskKey)
    }
  })

  ipcMain.handle('ai:complete', async (event, params: { text: string; system?: string; temperature?: number; taskKey?: string; styleSource?: string }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return ''
    if (aiManager.validateConfig(config)) return ''

    const window = BrowserWindow.fromWebContents(event.sender)
    const taskKey = getCompleteTaskKey(window?.id, params.taskKey)
    const previous = completeAbortControllers.get(taskKey)
    if (previous) previous.abort()
    const controller = new AbortController()
    completeAbortControllers.set(taskKey, controller)
    const signal = controller.signal

    try {
      const provider = aiManager.getProvider(config)
      const options = params.temperature !== undefined ? { temperature: params.temperature } : undefined
      const stylePrompt = params.styleSource ? formatWritingStylePrompt(analyzeWritingStyle(params.styleSource)) : ''
      const system = [params.system || '续写1-2句，只输出续写内容。', stylePrompt].filter(Boolean).join('\n\n')
      const { text: result, aborted, errorChunk } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: system },
          { role: 'user', content: params.text }
        ], signal, options),
        { signal }
      )
      if (aborted || errorChunk !== null) return ''
      return params.system ? result.trim() : result.trim().slice(0, 200)
    } catch {
      return ''
    } finally {
      if (completeAbortControllers.get(taskKey) === controller) {
        completeAbortControllers.delete(taskKey)
      }
    }
  })

  ipcMain.handle('ai:generate-graph', async (event, params: { filePaths: string[]; vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false, error: '窗口不存在' }

    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, error: '未配置 AI 提供商' }
    const configError = aiManager.validateConfig(config)
    if (configError) return { success: false, error: configError }

    const { readFileSync } = require('fs')
    const { basename } = require('path')

    const maxFiles = 30
    const filesToProcess = params.filePaths.slice(0, maxFiles)
    let filesContent = ''
    const fileNames: string[] = []
    for (const fp of filesToProcess) {
      try {
        const content = readFileSync(fp, 'utf-8')
        const name = basename(fp, '.md')
        fileNames.push(name)
        const summary = content.slice(0, 1000)
        filesContent += `## ${name}\n${summary}\n\n---\n\n`
      } catch {}
    }

    if (!filesContent) return { success: false, error: '无法读取文件内容' }

    const systemPrompt = `Analyze knowledge relationships between notes and output a Mermaid graph. Output graph TD syntax directly — the first line must be "graph TD".

<format>
- Node IDs use letters (A, B, C...), labels use square brackets wrapping the note title
- Edges use -->|relationship| annotation, relationship labels are 2-4 words (e.g., foundation, advanced, comparison, depends on, contains, applies)
- Each node has at most 3 edges — keep only the most meaningful relationships
</format>

<quality>
- Only create edges between genuinely related content — do not force connections for graph connectivity
- Relationship labels must be specific: use "prerequisite" not "related", use "implements" not "associated"
- When note count is large (>10), prioritize cross-topic bridging relationships
</quality>

<example>
graph TD
    A[React Hooks] -->|foundation| B[useState]
    A -->|advanced| C[Custom Hooks]
    B -->|applies| C
</example>`

    const provider = aiManager.getProvider(config)
    const windowId = window.id
    const controller = startAiTask(windowId)

    try {
      const { text: result, aborted, errorChunk } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Below are ${fileNames.length} notes. Analyze their relationships and generate a knowledge graph:\n\n${filesContent}` }
        ], controller.signal),
        {
          signal: controller.signal,
          window,
          onText: (delta) => window.webContents.send('ai:graph-progress', { content: delta })
        }
      )
      if (errorChunk !== null) return { success: false, error: errorChunk || 'AI 返回错误' }
      if (aborted) return { success: false, error: '已取消' }
      window.webContents.send('ai:graph-done', {})
      return { success: true, content: result.trim() }
    } catch (err: unknown) {
      if (controller.signal.aborted) return { success: false, error: '已取消' }
      return { success: false, error: getErrorMessage(err) }
    } finally {
      finishAiTask(windowId, controller)
    }
  })

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
    const { writeFileSync, mkdirSync, existsSync, readFileSync } = require('fs')
    const { join, basename } = require('path')

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

    const { readFileSync } = require('fs')
    const { basename } = require('path')

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

  // --- Agent chat with tool use ---


  function estimateTokens(messages: ChatMessage[]): number {
    let total = 0
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += estimateStringTokens(msg.content)
      } else {
        for (const part of msg.content) {
          if (part.text) total += estimateStringTokens(part.text)
        }
      }
    }
    return total
  }

  function estimateStringTokens(text: string): number {
    let cjk = 0
    let other = 0
    for (const ch of text) {
      const code = ch.codePointAt(0)!
      if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) ||
          (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF)) {
        cjk++
      } else {
        other++
      }
    }
    return cjk + Math.ceil(other / 4)
  }

  async function compactMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const TOKEN_THRESHOLD = 6000
    const tokens = estimateTokens(messages)
    if (tokens <= TOKEN_THRESHOLD) return messages

    // Keep system messages and the most recent 4 user+assistant pairs
    const systemMsgs = messages.filter((m) => m.role === 'system')
    const nonSystemMsgs = messages.filter((m) => m.role !== 'system')

    // Keep last 8 non-system messages (4 pairs)
    const keepCount = Math.min(8, nonSystemMsgs.length)
    const recentMsgs = nonSystemMsgs.slice(-keepCount)
    const oldMsgs = nonSystemMsgs.slice(0, -keepCount)

    if (oldMsgs.length === 0) return messages

    // Summarize old messages
    const oldContent = oldMsgs.map((m) => {
      const text = typeof m.content === 'string'
        ? m.content
        : m.content.filter((p) => p.type === 'text').map((p) => p.text).join(' ')
      return `${m.role}: ${text.slice(0, 500)}`
    }).join('\n')

    try {
      const config = aiManager.getActiveConfig()
      if (!config || aiManager.validateConfig(config)) return messages

      const provider = aiManager.getProvider(config)
      const { text: summary, errorChunk } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: '将以下对话历史压缩为结构化摘要。格式：\n[对话摘要]\n主要讨论: ...\n关键信息: ...\n待处理: ...\n\n只输出摘要，不要其他内容。' },
          { role: 'user', content: oldContent }
        ])
      )
      if (errorChunk !== null) return messages

      if (!summary.trim()) return messages

      const compactedSystemMsg: ChatMessage = {
        role: 'system',
        content: `以下是之前对话的摘要：\n${summary.trim()}`
      }

      return [...systemMsgs, compactedSystemMsg, ...recentMsgs]
    } catch {
      return messages
    }
  }

  ipcMain.handle('ai:chat-agent', async (event, params: { messages: ChatMessage[]; vaultPath?: string; systemPrompt?: string; currentFilePath?: string | null }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    const windowId = window.id
    const controller = startAiTask(windowId)

    const vaultPath = params.vaultPath || ''
    const longContextPack = buildLongContextPackSafely(params.vaultPath, params.currentFilePath)

    try {
      // Build initial messages with system prompt
      let messages = [...params.messages]
      const customPrompt = params.systemPrompt || (store.get('aiSystemPrompt') as string) || ''
      const defaultSystemPrompt = `你是一个智能知识库助手。你可以搜索和阅读笔记来帮助用户。
使用工具来获取信息，然后基于获取的内容回答用户问题。
如果用户的问题可以通过搜索笔记来回答，请先搜索相关内容。
如果用户想创建或修改笔记，请让用户切换到编辑模式，那里会先展示预览并等待确认。`

      const systemContent = mergeLongContextIntoSystemPrompt(customPrompt || defaultSystemPrompt, longContextPack)
      messages = withMergedSystemContext(systemContent, messages)

      // Context compaction
      messages = await compactMessages(messages)

      const MAX_TOOL_ITERATIONS = 5
      const MAX_CONTINUATIONS = 2
      let continuations = 0
      const agentSources: ChatSource[] = longContextPack?.sources ? [...longContextPack.sources] : []
      if (agentSources.length > 0) window.webContents.send('ai:sources', agentSources)

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        if (window.isDestroyed() || controller.signal.aborted) break

        let hasToolCalls = false
        let textContent = ''
        let finishReason = 'stop'

        for await (const chunk of aiManager.chatWithTools(messages, AGENT_TOOLS, controller.signal)) {
          if (window.isDestroyed() || controller.signal.aborted) break

          if (chunk.type === 'tool_calls') {
            hasToolCalls = true
            const toolCallEvent = chunk as ToolCallEvent

            messages.push({
              role: 'assistant',
              content: '',
              tool_calls: toolCallEvent.calls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: c.arguments }
              }))
            })

            for (const call of toolCallEvent.calls) {
              const parsedArgs = parseToolArguments(call.arguments)

              window.webContents.send('ai:stream', {
                type: 'tool_call',
                content: JSON.stringify({ name: call.name, args: parsedArgs.args })
              })

              let result: Awaited<ReturnType<typeof executeToolCall>> = { content: parsedArgs.error || '' }
              if (parsedArgs.error) {
                result = { content: parsedArgs.error }
              } else {
                try {
                  result = await executeToolCall(call.name, parsedArgs.args, vaultPath, params.currentFilePath)
                } catch (err: unknown) {
                  result = { content: `工具 ${call.name} 执行失败: ${getErrorMessage(err)}` }
                }
              }
              if (result.sources && result.sources.length > 0) {
                for (const source of result.sources) {
                  if (!agentSources.some((s) => s.filePath === source.filePath && s.title === source.title)) {
                    agentSources.push(source)
                  }
                }
                window.webContents.send('ai:sources', agentSources)
              }

              messages.push({
                role: 'tool',
                content: result.content,
                tool_call_id: call.id
              })
            }
            break
          } else if (chunk.type === 'text') {
            textContent += chunk.content
            window.webContents.send('ai:stream', chunk)
          } else if (chunk.type === 'done') {
            finishReason = chunk.meta?.finishReason || 'stop'
          } else if (chunk.type === 'retry') {
            window.webContents.send('ai:stream', chunk)
          } else if (chunk.type === 'error') {
            window.webContents.send('ai:stream', chunk)
            finishAiTask(windowId, controller)
            return
          }
        }

        if (!hasToolCalls) {
          // Check for truncation and auto-continue
          if (finishReason === 'length' && continuations < MAX_CONTINUATIONS && textContent.length > 0) {
            continuations++
            messages.push({ role: 'assistant', content: textContent })
            messages.push({ role: 'user', content: '继续输出，不要重复已输出的内容。' })
            // Continue the loop to get more output
            continue
          }
          // Final response complete
          break
        }
        // If there were tool calls, loop continues to get the model's response
      }

      if (!window.isDestroyed() && !controller.signal.aborted) {
        window.webContents.send('ai:stream', { type: 'done', content: '' })
      }
    } catch (err: unknown) {
      if (!window.isDestroyed() && !controller.signal.aborted) {
        window.webContents.send('ai:stream', { type: 'error', content: getErrorMessage(err) })
        window.webContents.send('ai:stream', { type: 'done', content: '' })
      }
    } finally {
      finishAiTask(windowId, controller)
    }
  })

  ipcMain.handle('ai:list-tool-surface', async () => {
    const { listToolSurfaceEntries } = await import('../services/tool-surface/registry')
    const entries = listToolSurfaceEntries().map((entry) => ({
      name: entry.name,
      kind: entry.kind,
      category: entry.category,
      labelKey: entry.labelKey,
      keywords: entry.keywords,
      requiresCurrentNote: entry.requiresCurrentNote
    }))
    return { entries }
  })

  ipcMain.handle('ai:run-tool', async (_event, params: {
    vaultPath: string
    toolName: string
    args?: Record<string, unknown>
    currentFilePath?: string | null
  }) => {
    const { findToolSurfaceEntry } = await import('../services/tool-surface/registry')
    const entry = findToolSurfaceEntry(params.toolName)
    if (!entry) {
      return { ok: false as const, error: `Tool not allowed in direct mode: ${params.toolName}` }
    }
    if (entry.kind === 'agent_only') {
      return { ok: false as const, error: 'Tool requires agent context' }
    }
    if (entry.requiresCurrentNote && !params.currentFilePath) {
      return { ok: false as const, error: 'Current note required' }
    }
    const merged = { ...(entry.defaultArgs ?? {}), ...(params.args ?? {}) }
    try {
      const result = await executeToolCall(entry.name, merged, params.vaultPath, params.currentFilePath)
      return { ok: true as const, content: result.content, sources: result.sources }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  setAgentToolRunner(async (toolName, args, vaultPath, currentFilePath) => {
    return executeToolCall(toolName, args, vaultPath, currentFilePath)
  })
}
