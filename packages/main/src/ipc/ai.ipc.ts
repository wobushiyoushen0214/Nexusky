import { ipcMain, BrowserWindow } from 'electron'
import { aiManager, AIProviderConfig, ChatMessage, ChatStreamEvent, ToolCallEvent, ToolDefinition } from '../services/ai'
import { store } from '../services/store'
import { semanticSearch, findSimilarNotes } from '../services/embedding'
import { listOllamaModels } from '../services/ai/ollama-provider'
import { extractJsonFromText } from '../services/ai/json'
import { normalizeGeneratedNotePlan } from '../services/ai/note-plan'
import { extractMarkdownBlockReference, extractMarkdownHeadingSection, extractNoteReferenceBlockId, extractNoteReferenceHeading, findNoteCandidatesForAiTool, findNoteForAiTool } from '../services/ai/note-lookup'
import { formatListPropertiesToolResult, formatListTagsToolResult, formatListTasksToolResult, formatNoteLinksToolResult, formatNotesByPropertyToolResult, formatNotesByTagToolResult, formatPropertyValue, formatReadNoteToolResult, formatRecentNotesToolResult, formatSearchNotesToolResult, formatUnresolvedLinksToolResult } from '../services/ai/search-results'
import { parseToolArguments } from '../services/ai/tool-arguments'
import { normalizeToolLimit } from '../services/ai/tool-limits'
import { logger } from '../services/logger'
import { getAllNotes, getAllTags, getAllTasks, getBacklinks, getNotesByTag, getOutgoingLinks, getPropertyRows, getUnlinkedMentions, indexNote, resolveAllLinks } from '../services/indexer'
import { getDatabase } from '../services/database'
import { generateMemory, readMemory, readAllMemories, findRelatedByMemory, deleteMemory } from '../services/memory'
import { abortAiTask, finishAiTask, startAiTask } from '../services/ai-task-control'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

function getStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

export function registerAiIPC(): void {
  ipcMain.handle('ai:get-providers', () => {
    return (store.get('aiProviders') as AIProviderConfig[] | undefined) || []
  })

  ipcMain.handle('ai:save-providers', (_event, params: { providers: AIProviderConfig[] }) => {
    store.set('aiProviders', params.providers)
    aiManager.clearCache()
  })

  ipcMain.handle('ai:set-active', (_event, params: { providerId: string }) => {
    store.set('activeProviderId', params.providerId)
    aiManager.clearCache()
  })

  ipcMain.handle('ai:get-active-provider', () => {
    return (store.get('activeProviderId') as string | undefined) || null
  })

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
      for await (const chunk of aiManager.chat([
        { role: 'system', content: systemPrompt },
        ...params.messages.filter((m) => m.role !== 'system').slice(-8)
      ], controller.signal)) {
        if (controller.signal.aborted) throw new Error('已取消')
        if (chunk.type === 'text') result += chunk.content
        if (chunk.type === 'error') break
      }
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

  ipcMain.handle('ai:validate', async (_event, params: { config: AIProviderConfig }) => {
    const configError = aiManager.validateConfig(params.config)
    if (configError) return { ok: false, error: configError }
    const provider = aiManager.getProvider(params.config)
    return provider.validate()
  })

  ipcMain.handle('ai:chat', async (event, params: { messages: ChatMessage[]; vaultPath?: string; systemPrompt?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    const windowId = window.id
    const controller = startAiTask(windowId)

    let messages = [...params.messages]

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
          messages = [systemMsg, ...messages.filter((m) => m.role !== 'system')]

          window.webContents.send('ai:sources', results.map((r) => ({
            title: r.title,
            filePath: r.filePath,
            chunk: r.chunk.slice(0, 100),
            score: r.score
          })))
        } else if (params.systemPrompt) {
          messages = [{ role: 'system', content: params.systemPrompt }, ...messages.filter((m) => m.role !== 'system')]
        }
      }
    } else if (params.systemPrompt) {
      messages = [{ role: 'system', content: params.systemPrompt }, ...messages.filter((m) => m.role !== 'system')]
    }

    try {
      for await (const chunk of aiManager.chat(messages, controller.signal)) {
        if (window.isDestroyed() || controller.signal.aborted) break
        window.webContents.send('ai:stream', chunk)
      }
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

  ipcMain.handle('ai:complete', async (event, params: { text: string; system?: string; temperature?: number; taskKey?: string }) => {
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
      let result = ''
      const options = params.temperature !== undefined ? { temperature: params.temperature } : undefined
      for await (const chunk of provider.chatStream([
        { role: 'system', content: params.system || '续写1-2句，只输出续写内容。' },
        { role: 'user', content: params.text }
      ], signal, options)) {
        if (signal.aborted) return ''
        if (chunk.type === 'text') result += chunk.content
        if (chunk.type === 'error') return ''
      }
      return signal.aborted ? '' : (params.system ? result.trim() : result.trim().slice(0, 200))
    } catch {
      return ''
    } finally {
      if (completeAbortControllers.get(taskKey) === controller) {
        completeAbortControllers.delete(taskKey)
      }
    }
  })

  ipcMain.handle('ai:detect-local-config', async () => {
    const { homedir, platform } = require('os')
    const { readFileSync, existsSync } = require('fs')
    const { join } = require('path')
    const home = homedir()
    const os = platform()
    const result: { claude?: { apiKey: string; baseUrl: string; source?: string }; openai?: { apiKey: string; source?: string }; codex?: { command: string; source?: string }; skipped?: string[] } = { skipped: [] }
    const isUsableOpenAIKey = (key: unknown) => typeof key === 'string' && /^sk-[A-Za-z0-9_-]+/.test(key.trim())

    // Claude Code config paths per platform
    const claudePaths = [
      join(home, '.claude', 'settings.json'),
      ...(os === 'win32' ? [join(process.env.APPDATA || '', 'claude', 'settings.json')] : []),
      ...(os === 'linux' ? [join(home, '.config', 'claude', 'settings.json')] : []),
    ]
    for (const p of claudePaths) {
      if (!existsSync(p)) continue
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8'))
        const env = data.env || {}
        if (env.ANTHROPIC_AUTH_TOKEN) {
          result.claude = { apiKey: env.ANTHROPIC_AUTH_TOKEN, baseUrl: env.ANTHROPIC_BASE_URL || '', source: 'Claude Code' }
          break
        }
      } catch {}
    }

    if (isUsableOpenAIKey(process.env.OPENAI_API_KEY)) {
      result.openai = { apiKey: process.env.OPENAI_API_KEY!.trim(), source: '环境变量 OPENAI_API_KEY' }
    }

    // Codex config paths per platform
    const codexPaths = [
      join(home, '.codex', 'auth.json'),
      ...(os === 'win32' ? [join(process.env.APPDATA || '', 'codex', 'auth.json')] : []),
      ...(os === 'linux' ? [join(home, '.config', 'codex', 'auth.json')] : []),
    ]
    for (const p of codexPaths) {
      if (!existsSync(p)) continue
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8'))
        if (!result.openai && isUsableOpenAIKey(data.OPENAI_API_KEY)) {
          result.openai = { apiKey: data.OPENAI_API_KEY.trim(), source: 'Codex API Key' }
          break
        }
        if (data.auth_mode === 'chatgpt' && data.tokens) {
          result.codex = { command: 'codex', source: 'Codex ChatGPT 登录' }
        } else if (data.OPENAI_API_KEY && !isUsableOpenAIKey(data.OPENAI_API_KEY)) {
          result.skipped?.push('Codex 中的 OpenAI Key 格式不符合 API Key 要求，已跳过')
        }
      } catch {}
    }

    // Fallback to environment variables
    if (!result.claude && process.env.ANTHROPIC_API_KEY) {
      result.claude = { apiKey: process.env.ANTHROPIC_API_KEY, baseUrl: process.env.ANTHROPIC_BASE_URL || '', source: '环境变量 ANTHROPIC_API_KEY' }
    }

    if (result.skipped?.length === 0) delete result.skipped
    return result
  })

  ipcMain.handle('ai:list-ollama-models', async (_event, params: { baseUrl?: string }) => {
    return listOllamaModels(params.baseUrl)
  })

  ipcMain.handle('ai:summarize', async (_event, params: { content: string }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return ''
    if (aiManager.validateConfig(config)) return ''
    try {
      const provider = aiManager.getProvider(config)
      let result = ''
      for await (const chunk of provider.chatStream([
        { role: 'system', content: '为以下笔记生成一段简洁的摘要（2-3句话）。只输出摘要内容，不要前缀。' },
        { role: 'user', content: params.content.slice(0, 3000) }
      ])) {
        if (chunk.type === 'text') result += chunk.content
        if (chunk.type === 'error') return ''
      }
      return result.trim()
    } catch {
      return ''
    }
  })

  ipcMain.handle('ai:suggest-tags', async (_event, params: { content: string; existingTags: string[] }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return []
    if (aiManager.validateConfig(config)) return []

    try {
      const provider = aiManager.getProvider(config)
      let result = ''
      for await (const chunk of provider.chatStream([
        { role: 'system', content: `你是一个标签建议助手。根据笔记内容建议 2-4 个标签。只输出标签，用逗号分隔，不要 # 前缀，不要解释。已有标签: ${params.existingTags.join(', ')}` },
        { role: 'user', content: params.content.slice(0, 2000) }
      ])) {
        if (chunk.type === 'text') result += chunk.content
        if (chunk.type === 'error') return []
      }
      return result.trim().split(/[,，、\n]/).map((t) => t.trim()).filter((t) => t && t.length < 20)
    } catch {
      return []
    }
  })

  ipcMain.handle('ai:edit', async (event, params: { instruction: string; fileContent: string; filePath: string; images?: string[]; history?: string[] }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, error: '未配置 AI 提供商' }
    const configError = aiManager.validateConfig(config)
    if (configError) return { success: false, error: configError }

    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false, error: '窗口不存在' }

    const systemPrompt = `You are a Markdown note editor. You receive the original note content and a modification instruction, then output the modified complete file.

<output_format>
Output the modified complete Markdown text directly. The first character of your response must be the first character of the file content.
- Preserve YAML frontmatter if present
- Preserve heading levels, list marker style (- or *), and blank line conventions from the original
- Output the ENTIRE file, not just the modified section
</output_format>

<constraints>
- Only modify what the instruction asks for; leave everything else unchanged
- Match the original list marker style: if the original uses -, keep -; if it uses *, keep *
- NEVER wrap output in \`\`\`markdown or any code fence
- NEVER prepend or append explanations, confirmations, or extra blank lines
</constraints>`

    let fileContent = params.fileContent
    const TOKEN_LIMIT = 12000
    const estimatedTokens = Math.ceil(fileContent.length / 4)

    if (estimatedTokens > TOKEN_LIMIT) {
      return {
        success: false,
        error: '当前笔记过大，无法安全生成完整文件修改。请先选中需要修改的段落，或把笔记拆成更小的文件后再使用 AI 编辑。'
      }
    }

    let textContent = `文件: ${params.filePath}\n\n当前内容:\n${fileContent}\n\n`
    if (params.history && params.history.length > 0) {
      textContent += `之前的修改指令（已应用）:\n${params.history.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n`
    }
    textContent += `本次修改指令: ${params.instruction}`

    let userMessage: ChatMessage
    if (params.images && params.images.length > 0) {
      userMessage = {
        role: 'user',
        content: [
          { type: 'text', text: textContent },
          ...params.images.map((img) => ({ type: 'image_url' as const, image_url: { url: img } }))
        ]
      }
    } else {
      userMessage = { role: 'user', content: textContent }
    }

    const windowId = window.id
    const controller = startAiTask(windowId)

    try {
      const provider = aiManager.getProvider(config)
      let result = ''
      for await (const chunk of provider.chatStream([
        { role: 'system', content: systemPrompt },
        userMessage
      ], controller.signal)) {
        if (window.isDestroyed() || controller.signal.aborted) break
        if (chunk.type === 'text') {
          result += chunk.content
          window.webContents.send('ai:edit-stream', { type: 'text', content: chunk.content })
        }
        if (chunk.type === 'error') {
          return { success: false, error: chunk.content || 'AI 返回错误' }
        }
      }
      if (controller.signal.aborted) return { success: false, error: '已取消' }
      const trimmed = result.trim()
      if (!trimmed) return { success: false, error: 'AI 未返回有效内容，请检查 API Key 配置' }
      return { success: true, content: trimmed }
    } catch (err: unknown) {
      if (controller.signal.aborted) return { success: false, error: '已取消' }
      return { success: false, error: getErrorMessage(err) }
    } finally {
      if (!window.isDestroyed()) {
        window.webContents.send('ai:edit-stream', { type: 'done' })
      }
      finishAiTask(windowId, controller)
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
    let result = ''
    const windowId = window.id
    const controller = startAiTask(windowId)

    try {
      for await (const chunk of provider.chatStream([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Below are ${fileNames.length} notes. Analyze their relationships and generate a knowledge graph:\n\n${filesContent}` }
      ], controller.signal)) {
        if (window.isDestroyed() || controller.signal.aborted) break
        if (chunk.type === 'text') {
          result += chunk.content
          window.webContents.send('ai:graph-progress', { content: chunk.content })
        }
        if (chunk.type === 'error') return { success: false, error: chunk.content || 'AI 返回错误' }
      }
      if (controller.signal.aborted) return { success: false, error: '已取消' }
      window.webContents.send('ai:graph-done', {})
      return { success: true, content: result.trim() }
    } catch (err: unknown) {
      if (controller.signal.aborted) return { success: false, error: '已取消' }
      return { success: false, error: getErrorMessage(err) }
    } finally {
      finishAiTask(windowId, controller)
    }
  })

  ipcMain.handle('ai:generate-notes', async (event, params: { instruction: string; vaultPath: string; targetDir?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false, error: '窗口不存在', files: [] }

    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, error: '未配置 AI 提供商', files: [] }
    const configError = aiManager.validateConfig(config)
    if (configError) return { success: false, error: configError, files: [] }

    const windowId = window.id
    const controller = startAiTask(windowId)

    const provider = aiManager.getProvider(config)
    const { writeFileSync, mkdirSync, existsSync, readFileSync } = require('fs')
    const { join, basename } = require('path')

    // Step 1: Ask AI to plan the notes
    window.webContents.send('ai:generate-notes-progress', { stage: 'planning', message: '正在规划笔记结构...' })

    let planResult = ''
    try {
      for await (const chunk of provider.chatStream([
        { role: 'system', content: `你是一个笔记规划助手。用户会给你一个主题，请规划需要创建的笔记列表。
输出格式为 JSON 数组，每项包含 title（文件标题）和 brief（一句话描述内容方向）。
重要：title 是纯笔记标题，绝对不要包含目录名、路径前缀或分类前缀（例如不要写"react/Hooks入门"或"reactHooks入门"，直接写"Hooks入门"）。
只输出 JSON，不要其他文字。示例：
[{"title":"React Hooks 入门","brief":"介绍 useState、useEffect 等基础 Hook"},{"title":"自定义 Hook","brief":"如何封装可复用的自定义 Hook"}]` },
        { role: 'user', content: params.instruction }
      ], controller.signal)) {
        if (controller.signal.aborted) break
        if (chunk.type === 'text') planResult += chunk.content
        if (chunk.type === 'error') { finishAiTask(windowId, controller); return { success: false, error: chunk.content, files: [] } }
      }
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

    window.webContents.send('ai:generate-notes-progress', { stage: 'planned', message: `将在「${dirName}」下生成 ${plan.length} 篇笔记`, plan })

    // Pre-compute safe file names for consistent wikilinks
    const safeNames = plan.map((p) => p.title)

    // Step 2: Generate each note
    const createdFiles: string[] = []
    for (let i = 0; i < plan.length; i++) {
      if (controller.signal.aborted) break
      const item = plan[i]
      window.webContents.send('ai:generate-notes-progress', { stage: 'generating', message: `正在生成 (${i + 1}/${plan.length}): ${item.title}`, current: i + 1, total: plan.length })

      let noteContent = ''
      try {
        for await (const chunk of provider.chatStream([
          { role: 'system', content: `你是一个知识库笔记写作助手。请根据标题和描述，写一篇结构清晰的 Markdown 笔记。

规则：
1. 第一行必须是 # 标题，标题必须和给定的标题完全一致
2. 不要使用 [[]] 双链语法，写自然流畅的内容即可
3. 内容包含分节、要点，结构清晰
4. 在内容中自然地提及相关概念和主题，但不要硬塞链接
5. 只输出 Markdown 内容，不要其他解释` },
          { role: 'user', content: `标题: ${safeNames[i]}\n描述: ${item.brief}\n\n同批次的其他笔记主题（可在内容中自然提及相关概念）:\n${safeNames.filter((_, j) => j !== i).map((n) => `- ${n}`).join('\n')}` }
        ], controller.signal)) {
          if (controller.signal.aborted) break
          if (chunk.type === 'text') noteContent += chunk.content
          if (chunk.type === 'error') break
        }
      } catch { continue }

      if (noteContent.trim() && !controller.signal.aborted) {
        const filePath = join(targetDir, `${safeNames[i]}.md`)
        try {
          writeFileSync(filePath, noteContent.trim(), 'utf-8')
          createdFiles.push(filePath)
        } catch {}
      }
    }

    // Step 3: Index all generated files and infer semantic relationships
    if (createdFiles.length > 0) {
      window.webContents.send('ai:generate-notes-progress', { stage: 'indexing', message: '正在索引笔记关系...' })
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
        window.webContents.send('ai:generate-notes-progress', { stage: 'indexing', message: '正在分析笔记语义关系...' })
        try {
          const noteSummaries = createdFiles.map((fp) => {
            const content = readFileSync(fp, 'utf-8')
            const name = basename(fp, '.md')
            return `[${name}]\n${content.slice(0, 500)}`
          }).join('\n\n---\n\n')

          let relResult = ''
          for await (const chunk of provider.chatStream([
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
          ], controller.signal)) {
            if (controller.signal.aborted) break
            if (chunk.type === 'text') relResult += chunk.content
          }

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
        window.webContents.send('ai:generate-notes-progress', { stage: 'index-error', message: `索引失败: ${indexErr}` })
      }
    }

    const aborted = controller.signal.aborted
    finishAiTask(windowId, controller)
    window.webContents.send('ai:generate-notes-progress', { stage: 'done', message: aborted ? `已停止，已生成 ${createdFiles.length} 个文件` : `完成！已生成 ${createdFiles.length} 个文件` })
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
    let relResult = ''

    try {
      for await (const chunk of provider.chatStream([
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
      ])) {
        if (window.isDestroyed()) break
        if (chunk.type === 'text') relResult += chunk.content
        if (chunk.type === 'error') return { success: false, error: chunk.content || 'AI 返回错误' }
      }

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

  ipcMain.handle('ai:get-system-prompt', () => {
    return (store.get('aiSystemPrompt') as string) || ''
  })

  ipcMain.handle('ai:set-system-prompt', (_event, params: { prompt: string }) => {
    store.set('aiSystemPrompt', params.prompt)
  })

  // --- Agent chat with tool use ---

  const AGENT_TOOLS: ToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'search_notes',
        description: '搜索知识库中的笔记',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_note',
        description: '读取指定笔记的完整内容。title 可传笔记标题、alias、Folder/Note 路径或 wikilink。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题' }
          },
          required: ['title']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_note_links',
        description: '列出指定笔记的出链和反链。title 可传笔记标题、alias、Folder/Note 路径或 wikilink。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' }
          },
          required: ['title']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_tasks',
        description: '查询知识库中从 Markdown 任务列表索引出来的任务，默认返回未完成任务。',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'open、done 或 all，默认 open' },
            query: { type: 'string', description: '按任务文本、笔记标题或路径过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_tags',
        description: '列出知识库中的标签及使用次数，可按标签名过滤。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按标签名过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_notes_by_tag',
        description: '列出指定标签下的笔记。tag 可带或不带 # 前缀。',
        parameters: {
          type: 'object',
          properties: {
            tag: { type: 'string', description: '标签名，例如 project/research 或 #project/research' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          },
          required: ['tag']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_properties',
        description: '列出知识库中的结构化属性键、出现次数和样例值。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按属性键过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_notes_by_property',
        description: '按结构化属性键和值列出笔记。可查询 frontmatter 和 Dataview inline fields。',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: '属性键，例如 status、priority、aliases' },
            value: { type: 'string', description: '按属性值包含匹配过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          },
          required: ['key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_recent_notes',
        description: '列出最近更新的笔记，可按标题或路径过滤。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按标题或路径过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_unresolved_links',
        description: '列出知识库中尚未解析到现有笔记的 wikilink 断链，可按来源、目标或上下文过滤。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按来源标题、路径、目标或上下文过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
  ]

  async function executeToolCall(
    name: string,
    args: Record<string, unknown>,
    vaultPath: string
  ): Promise<{ content: string; sources?: { title: string; filePath: string; chunk: string; score: number }[] }> {
    if (!vaultPath) return { content: '未打开知识库，无法使用笔记工具。' }

    switch (name) {
      case 'search_notes': {
        const query = getStringArg(args, 'query')
        if (!query.trim()) return { content: 'search_notes 缺少 query 参数。请根据用户问题提供明确的搜索关键词。' }
        const results = await semanticSearch(vaultPath, query, normalizeToolLimit(args.limit))
        if (results.length === 0) return { content: '未找到相关笔记。' }
        return {
          content: formatSearchNotesToolResult(results),
          sources: results.map((r) => ({
            title: r.title,
            filePath: r.filePath,
            chunk: r.chunk.slice(0, 100),
            score: r.score
          }))
        }
      }
      case 'read_note': {
        const title = getStringArg(args, 'title')
        if (!title.trim()) return { content: 'read_note 缺少 title 参数。请先搜索笔记，或提供要读取的笔记标题。' }
        const note = findNoteForAiTool(vaultPath, title)
        if (!note) {
          const candidates = findNoteCandidatesForAiTool(vaultPath, title)
          if (candidates.length > 1) {
            return {
              content: `找到多个可能的笔记，请用 read_note 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
            }
          }
          return { content: `未找到标题为「${title}」的笔记。` }
        }
        try {
          const content = readFileSync(note.absolutePath, 'utf-8')
          const blockId = extractNoteReferenceBlockId(title)
          const block = blockId ? extractMarkdownBlockReference(content, blockId) : null
          const heading = block ? null : extractNoteReferenceHeading(title)
          const section = heading ? extractMarkdownHeadingSection(content, heading) : null
          const selectedContent = block || section || content
          return {
            content: formatReadNoteToolResult({ title: note.title, filePath: note.filePath, content: selectedContent, section: section ? heading || undefined : undefined, blockId: block ? blockId || undefined : undefined }),
            sources: [{
              title: note.title,
              filePath: note.filePath,
              chunk: selectedContent.slice(0, 100),
              score: 1
            }]
          }
        } catch {
          return { content: `无法读取笔记「${title}」。` }
        }
      }
      case 'list_note_links': {
        const title = getStringArg(args, 'title')
        if (!title.trim()) return { content: 'list_note_links 缺少 title 参数。请先搜索笔记，或提供要查看关系的笔记标题。' }
        const note = findNoteForAiTool(vaultPath, title)
        if (!note) {
          const candidates = findNoteCandidatesForAiTool(vaultPath, title)
          if (candidates.length > 1) {
            return {
              content: `找到多个可能的笔记，请用 list_note_links 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
            }
          }
          return { content: `未找到标题为「${title}」的笔记。` }
        }

        const db = getDatabase(vaultPath)
        const row = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(note.filePath) as { id: string } | undefined
        if (!row) return { content: `未找到笔记索引「${note.filePath}」。请先刷新索引。` }

        const outgoing = getOutgoingLinks(vaultPath, row.id)
        const backlinks = getBacklinks(vaultPath, row.id)
        const unlinkedMentions = getUnlinkedMentions(vaultPath, row.id)
        return {
          content: formatNoteLinksToolResult({ title: note.title, filePath: note.filePath, outgoing, backlinks, unlinkedMentions }),
          sources: [{
            title: note.title,
            filePath: note.filePath,
            chunk: `Outgoing: ${outgoing.length}; Backlinks: ${backlinks.length}; Unlinked mentions: ${unlinkedMentions.length}`,
            score: 1
          }]
        }
      }
      case 'list_tasks': {
        const status = getStringArg(args, 'status').trim().toLowerCase()
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const tasks = getAllTasks(vaultPath)
          .filter((task) => {
            if (status === 'done') return task.done
            if (status === 'all') return true
            return !task.done
          })
          .filter((task) => {
            if (!query) return true
            return [task.text, task.noteTitle, task.filePath].some((value) => value.toLowerCase().includes(query))
          })
          .slice(0, limit)
        return {
          content: formatListTasksToolResult(tasks),
          sources: tasks.map((task) => ({
            title: task.noteTitle,
            filePath: task.filePath,
            chunk: `${task.done ? '[x]' : '[ ]'} ${task.text}`.slice(0, 100),
            score: 1
          }))
        }
      }
      case 'list_tags': {
        const query = getStringArg(args, 'query').trim().toLowerCase().replace(/^#/, '')
        const limit = normalizeToolLimit(args.limit)
        const tags = getAllTags(vaultPath)
          .filter((tag) => !query || tag.name.toLowerCase().includes(query))
          .slice(0, limit)
        return { content: formatListTagsToolResult(tags) }
      }
      case 'list_notes_by_tag': {
        const tag = getStringArg(args, 'tag').trim().replace(/^#/, '')
        if (!tag) return { content: 'list_notes_by_tag 缺少 tag 参数。请提供要查询的标签名。' }
        const limit = normalizeToolLimit(args.limit)
        const notes = getNotesByTag(vaultPath, tag).slice(0, limit)
        return {
          content: formatNotesByTagToolResult(tag, notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `#${tag}`,
            score: 1
          }))
        }
      }
      case 'list_properties': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const summaries = new Map<string, { key: string; count: number; sampleValues: string[] }>()
        for (const row of getPropertyRows(vaultPath)) {
          for (const [key, value] of Object.entries(row.properties)) {
            if (query && !key.toLowerCase().includes(query)) continue
            const current = summaries.get(key) || { key, count: 0, sampleValues: [] }
            current.count += 1
            const text = formatPropertyValue(value)
            if (text && !current.sampleValues.includes(text) && current.sampleValues.length < 3) {
              current.sampleValues.push(text)
            }
            summaries.set(key, current)
          }
        }
        const properties = Array.from(summaries.values())
          .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
          .slice(0, limit)
        return { content: formatListPropertiesToolResult(properties) }
      }
      case 'list_notes_by_property': {
        const key = getStringArg(args, 'key').trim()
        if (!key) return { content: 'list_notes_by_property 缺少 key 参数。请提供要查询的属性键。' }
        const value = getStringArg(args, 'value').trim()
        const valueQuery = value.toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getPropertyRows(vaultPath)
          .map((row) => {
            const matchedKey = Object.keys(row.properties).find((propertyKey) => propertyKey.toLowerCase() === key.toLowerCase())
            if (!matchedKey) return null
            const text = formatPropertyValue(row.properties[matchedKey])
            if (valueQuery && !text.toLowerCase().includes(valueQuery)) return null
            return { title: row.title, filePath: row.filePath, value: text }
          })
          .filter((row): row is { title: string; filePath: string; value: string } => row !== null)
          .slice(0, limit)
        return {
          content: formatNotesByPropertyToolResult(key, notes, value || undefined),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `${key}: ${note.value}`.slice(0, 100),
            score: 1
          }))
        }
      }
      case 'list_recent_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
          .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
          .slice(0, limit)
        return {
          content: formatRecentNotesToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Updated: ${new Date(note.updatedAt).toISOString()}`,
            score: 1
          }))
        }
      }
      case 'list_unresolved_links': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const links = getAllNotes(vaultPath).flatMap((note) => (
          getOutgoingLinks(vaultPath, note.id)
            .filter((link) => !link.resolved)
            .map((link) => ({
              sourceTitle: note.title,
              sourcePath: note.filePath,
              targetTitle: link.targetTitle,
              context: link.context
            }))
        )).filter((link) => {
          if (!query) return true
          return [link.sourceTitle, link.sourcePath, link.targetTitle, link.context].some((value) => value.toLowerCase().includes(query))
        }).slice(0, limit)
        return {
          content: formatUnresolvedLinksToolResult(links),
          sources: links.map((link) => ({
            title: link.sourceTitle,
            filePath: link.sourcePath,
            chunk: `[[${link.targetTitle}]] ${link.context}`.slice(0, 100),
            score: 1
          }))
        }
      }
      case 'create_note': {
        return { content: '普通 Agent 对话不能直接创建笔记。请切换到编辑模式，生成内容会先展示预览并等待确认。' }
      }
      case 'edit_note': {
        return { content: '普通 Agent 对话不能直接修改笔记。请切换到编辑模式，修改会先展示 Diff 并等待确认。' }
      }
      default:
        return { content: `未知工具: ${name}` }
    }
  }

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
      let summary = ''
      for await (const chunk of provider.chatStream([
        { role: 'system', content: '将以下对话历史压缩为结构化摘要。格式：\n[对话摘要]\n主要讨论: ...\n关键信息: ...\n待处理: ...\n\n只输出摘要，不要其他内容。' },
        { role: 'user', content: oldContent }
      ])) {
        if (chunk.type === 'text') summary += chunk.content
        if (chunk.type === 'error') return messages
      }

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

  ipcMain.handle('ai:chat-agent', async (event, params: { messages: ChatMessage[]; vaultPath?: string; systemPrompt?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    const windowId = window.id
    const controller = startAiTask(windowId)

    const vaultPath = params.vaultPath || ''

    try {
      // Build initial messages with system prompt
      let messages = [...params.messages]
      const customPrompt = params.systemPrompt || (store.get('aiSystemPrompt') as string) || ''
      const defaultSystemPrompt = `你是一个智能知识库助手。你可以搜索和阅读笔记来帮助用户。
使用工具来获取信息，然后基于获取的内容回答用户问题。
如果用户的问题可以通过搜索笔记来回答，请先搜索相关内容。
如果用户想创建或修改笔记，请让用户切换到编辑模式，那里会先展示预览并等待确认。`

      const systemContent = customPrompt || defaultSystemPrompt
      messages = [{ role: 'system', content: systemContent }, ...messages.filter((m) => m.role !== 'system')]

      // Context compaction
      messages = await compactMessages(messages)

      const MAX_TOOL_ITERATIONS = 5
      const MAX_CONTINUATIONS = 2
      let continuations = 0
      const agentSources: { title: string; filePath: string; chunk: string; score: number }[] = []

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
                  result = await executeToolCall(call.name, parsedArgs.args, vaultPath)
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
}
