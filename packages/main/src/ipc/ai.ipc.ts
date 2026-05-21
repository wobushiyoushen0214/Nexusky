import { ipcMain, BrowserWindow } from 'electron'
import { aiManager, AIProviderConfig, ChatMessage, ChatStreamEvent, ToolCallEvent, ToolDefinition } from '../services/ai'
import { store } from '../services/store'
import { semanticSearch, findSimilarNotes } from '../services/embedding'
import { listOllamaModels } from '../services/ai/ollama-provider'
import { extractJsonFromText } from '../services/ai/json'
import { normalizeGeneratedNoteBatchPlan, normalizeGeneratedNotePlan } from '../services/ai/note-plan'
import { buildGeneratedNoteSystemPrompt, buildGeneratedNoteUserPrompt, ensureGeneratedNoteMetadata, ensureGeneratedNoteWikilinks } from '../services/ai/note-writing'
import { extractMarkdownBlockReference, extractMarkdownBlockReferences, extractMarkdownHeadingSection, extractMarkdownHeadings, extractNoteReferenceBlockId, extractNoteReferenceHeading, findNoteCandidatesForAiTool, findNoteForAiTool } from '../services/ai/note-lookup'
import { formatConnectionOpportunitiesToolResult, formatCurrentNoteLinkStatsToolResult, formatCurrentNotePropertiesToolResult, formatCurrentNoteUnlinkedReferencesToolResult, formatDeadEndNotesToolResult, formatDuplicateAliasesToolResult, formatDuplicateNoteTitlesToolResult, formatEmptyNotesToolResult, formatFindTextInNoteToolResult, formatKnowledgeBridgesToolResult, formatKnowledgeMaintenanceQueueToolResult, formatLargeNotesToolResult, formatLinkHubsToolResult, formatListFoldersToolResult, formatListPropertiesToolResult, formatListTagsToolResult, formatListTasksToolResult, formatMemoryFoldersToolResult, formatMemoryOverviewToolResult, formatMemoryRelatedNotesToolResult, formatMemoryTermPairsToolResult, formatMemoryTermsToolResult, formatMissingMemoryNotesToolResult, formatMissingPropertyNotesToolResult, formatNoteBlocksToolResult, formatNoteHeadingsToolResult, formatNoteLinksToolResult, formatNoteMemoriesToolResult, formatNotesByFolderToolResult, formatNotesByMemoryTermToolResult, formatNotesByPropertyToolResult, formatNotesByTagToolResult, formatOrphanNotesToolResult, formatPropertyValue, formatPropertyValuesToolResult, formatReadNoteLinesToolResult, formatReadNoteMemoryToolResult, formatReadNoteToolResult, formatRecentNotesToolResult, formatSearchNotesToolResult, formatSimilarNotesToolResult, formatUntaggedNotesToolResult, formatUnreferencedNotesToolResult, formatUnresolvedLinksToolResult, formatVaultOverviewToolResult } from '../services/ai/search-results'
import { findConnectionOpportunities } from '../services/ai/connection-opportunities'
import { findKnowledgeBridgeNotes } from '../services/ai/graph-insights'
import { buildKnowledgeMaintenanceQueue } from '../services/ai/maintenance-queue'
import { parseToolArguments } from '../services/ai/tool-arguments'
import { normalizeToolLimit } from '../services/ai/tool-limits'
import { withMergedSystemContext } from '../services/ai/system-context'
import { formatFlashcardsMarkdown, normalizeGeneratedFlashcards } from '../services/ai/flashcards'
import { logger } from '../services/logger'
import { getAllNotes, getAllTags, getAllTasks, getBacklinks, getNotesByTag, getOutgoingLinks, getOutgoingUnlinkedMentions, getPropertyRows, getUnlinkedMentions, indexNote, resolveAllLinks } from '../services/indexer'
import { getDatabase } from '../services/database'
import { generateMemory, readMemory, readAllMemories, findRelatedByMemory, deleteMemory } from '../services/memory'
import { abortAiTask, finishAiTask, startAiTask } from '../services/ai-task-control'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { analyzeWritingStyle, formatWritingStylePrompt } from '@shared/writing-style'
import { transcribeAudio, type TranscribeAudioParams } from '../services/ai/transcription'

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

function getNoteFolderPath(filePath: string): string {
  const index = filePath.lastIndexOf('/')
  return index > 0 ? filePath.slice(0, index) : ''
}

function normalizeFolderArg(folder: string): string {
  return folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function hasPropertyTags(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => formatPropertyValue(item).trim().length > 0)
  return formatPropertyValue(value).trim().length > 0
}

function getPropertyTextValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.map((item) => formatPropertyValue(item).trim()).filter((item) => item.length > 0)
}

function hasNonEmptyProperty(properties: Record<string, unknown>, key: string): boolean {
  const matchedKey = Object.keys(properties).find((propertyKey) => propertyKey.toLowerCase() === key.toLowerCase())
  if (!matchedKey) return false
  return getPropertyTextValues(properties[matchedKey]).length > 0
}

function normalizeMinCharacters(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return 8000
  return Math.max(1000, Math.floor(number))
}

function normalizeSimilarityThreshold(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return 0.75
  return Math.min(1, Math.max(0, number))
}

function normalizeMemoryRelationThreshold(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return 0.3
  return Math.min(1, Math.max(0, number))
}

function normalizeLinkHubMode(mode: string): 'backlinks' | 'outgoing' | 'total' {
  if (mode === 'backlinks' || mode === 'outgoing') return mode
  return 'total'
}

function getPositiveIntegerArg(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return null
  const integer = Math.floor(number)
  return integer > 0 ? integer : null
}

function isEmptyMarkdownNote(content: string): boolean {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  return withoutFrontmatter
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s+.+$/gm, '')
    .trim().length === 0
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
      const recentMessages = params.messages.filter((m) => m.role !== 'system').slice(-8)
      const clientContextMessages = params.messages.filter((m) => m.role === 'system')
      for await (const chunk of aiManager.chat([
        ...withMergedSystemContext(systemPrompt, [...clientContextMessages, ...recentMessages])
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
          messages = withMergedSystemContext(String(systemMsg.content), messages)

          window.webContents.send('ai:sources', results.map((r) => ({
            title: r.title,
            filePath: r.filePath,
            chunk: r.chunk.slice(0, 100),
            score: r.score
          })))
        } else if (params.systemPrompt) {
          messages = withMergedSystemContext(params.systemPrompt, messages)
        }
      }
    } else if (params.systemPrompt) {
      messages = withMergedSystemContext(params.systemPrompt, messages)
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

  ipcMain.handle('ai:transcribe', async (_event, params: TranscribeAudioParams) => {
    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, error: '未配置 AI 提供商' }
    const configError = aiManager.validateConfig(config)
    if (configError) return { success: false, error: configError }
    return transcribeAudio(config, params)
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
      let result = ''
      const options = params.temperature !== undefined ? { temperature: params.temperature } : undefined
      const stylePrompt = params.styleSource ? formatWritingStylePrompt(analyzeWritingStyle(params.styleSource)) : ''
      const system = [params.system || '续写1-2句，只输出续写内容。', stylePrompt].filter(Boolean).join('\n\n')
      for await (const chunk of provider.chatStream([
        { role: 'system', content: system },
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

  ipcMain.handle('ai:generate-flashcards', async (_event, params: { content: string; title?: string; maxCards?: number }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, cards: [], error: '未配置 AI 提供商' }
    const configError = aiManager.validateConfig(config)
    if (configError) return { success: false, cards: [], error: configError }

    try {
      const provider = aiManager.getProvider(config)
      let result = ''
      for await (const chunk of provider.chatStream([
        {
          role: 'system',
          content: `You generate Anki-style flashcards from Markdown notes.

Return only JSON with this shape:
{"cards":[{"type":"basic","front":"question","back":"answer","tags":["topic"]},{"type":"cloze","cloze":"A statement with {{c1::the hidden answer}}.","back":"why the answer matters","tags":["topic"]}]}

Rules:
- Generate 6-12 cards unless the note is very short.
- Mix basic Q/A and cloze cards when useful.
- Test durable concepts, definitions, distinctions, workflows, and gotchas.
- Avoid trivia, duplicate cards, and cards that require missing context.
- Keep each front/cloze under 80 words and each back under 120 words.`
        },
        { role: 'user', content: params.content.slice(0, 8000) }
      ], undefined, { temperature: 0.2 })) {
        if (chunk.type === 'text') result += chunk.content
        if (chunk.type === 'error') return { success: false, cards: [], error: chunk.content || 'AI 生成闪卡失败' }
      }

      const cards = normalizeGeneratedFlashcards(result, params.maxCards)
      if (cards.length === 0) return { success: false, cards: [], error: 'AI 未生成可用闪卡' }
      return { success: true, cards, markdown: formatFlashcardsMarkdown(cards, params.title) }
    } catch (error) {
      return { success: false, cards: [], error: getErrorMessage(error) }
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

    const stylePrompt = formatWritingStylePrompt(analyzeWritingStyle(params.fileContent))
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
</constraints>${stylePrompt ? `\n\n<writing_style>\n${stylePrompt}\n</writing_style>` : ''}`

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
      for await (const chunk of provider.chatStream([
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
      ], controller.signal)) {
        if (controller.signal.aborted) break
        if (chunk.type === 'text') planResult += chunk.content
        if (chunk.type === 'error') {
          finishAiTask(windowId, controller)
          return { success: false, error: chunk.content, batches: [] }
        }
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
        for await (const chunk of provider.chatStream([
          { role: 'system', content: buildGeneratedNoteSystemPrompt() },
          { role: 'user', content: buildGeneratedNoteUserPrompt(safeNames[i], item.brief, siblingTitles) }
        ], controller.signal)) {
          if (controller.signal.aborted) break
          if (chunk.type === 'text') noteContent += chunk.content
          if (chunk.type === 'error') break
        }
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
        name: 'find_similar_notes',
        description: '查找语义相近的跨文件夹笔记对，适合发现潜在双链、合并候选或相关主题。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按来源/目标标题或路径过滤，可选' },
            threshold: { type: 'number', description: '相似度阈值，0-1，默认 0.75' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'find_memory_related_notes',
        description: '基于已生成的笔记记忆查找共享概念或主题的跨文件夹笔记对，适合发现高层知识关系。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按来源/目标标题、路径或关联原因过滤，可选' },
            threshold: { type: 'number', description: '关系分数阈值，0-1，默认 0.3' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'find_connection_opportunities',
        description: '查找尚未互链但共享标签、属性或记忆概念的笔记对，适合主动发现可补 wikilink 的连接机会。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按来源/目标标题、路径或连接理由过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_note_memories',
        description: '列出已生成的笔记记忆摘要、概念和主题，适合先快速了解知识库内容再决定读取哪些笔记。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按标题、路径、概念、主题或摘要过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_memory_overview',
        description: '获取笔记记忆索引的覆盖率、过期数量、缺失数量以及概念/主题数量。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_memory_folders',
        description: '按文件夹汇总笔记记忆覆盖情况，帮助定位缺少或过期 memory 较多的目录。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按文件夹路径过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_memory_terms',
        description: '汇总已生成笔记记忆中的概念和主题，帮助发现知识库里的高频知识点。',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'concept、topic 或 all，默认 all' },
            query: { type: 'string', description: '按概念或主题名过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_memory_term_pairs',
        description: '汇总笔记记忆中经常共同出现的概念/主题对，帮助发现主题簇和潜在知识结构。',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'concept、topic、mixed 或 all，默认 all' },
            query: { type: 'string', description: '按任一概念或主题名过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_notes_by_memory_term',
        description: '按指定记忆概念或主题列出匹配笔记，适合从高频知识点跳转到具体内容。',
        parameters: {
          type: 'object',
          properties: {
            term: { type: 'string', description: '概念或主题名，例如 React Hooks' },
            type: { type: 'string', description: 'concept、topic 或 all，默认 all' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          },
          required: ['term']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_notes_missing_memory',
        description: '列出缺少笔记记忆或记忆已过期的笔记，适合诊断 memory 关系结果不完整的原因。',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'missing、stale 或 all，默认 all' },
            query: { type: 'string', description: '按标题或路径过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_note_memory',
        description: '读取指定笔记的记忆摘要、概念、主题和是否过期。title 可传笔记标题、alias、Folder/Note 路径或 wikilink。',
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
        name: 'read_current_note_memory',
        description: '读取当前编辑器正在打开笔记的记忆摘要、概念、主题和是否过期。适合先了解当前笔记的高层语义。',
        parameters: { type: 'object', properties: {} }
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
        name: 'read_current_note',
        description: '读取当前编辑器正在打开的笔记完整内容。适合用户提到“当前笔记”“这篇笔记”“这里”时直接使用。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_current_note_properties',
        description: '读取当前编辑器正在打开笔记的结构化属性/frontmatter/inline fields，包括 title、aliases、tags、cssclasses 等。适合回答当前笔记的状态、标签、别名或元数据。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_note_lines',
        description: '读取指定笔记的行号范围。适合先通过搜索、目录或块引用定位，再读取局部内容；单次最多 200 行。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' },
            startLine: { type: 'number', description: '起始行号，从 1 开始' },
            endLine: { type: 'number', description: '结束行号，可选；默认读取起始行后的 80 行，最多 200 行' }
          },
          required: ['title', 'startLine']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_current_note_lines',
        description: '读取当前编辑器正在打开笔记的行号范围。适合先用 list_current_note_headings 定位章节，再读取局部内容；单次最多 200 行。',
        parameters: {
          type: 'object',
          properties: {
            startLine: { type: 'number', description: '起始行号，从 1 开始' },
            endLine: { type: 'number', description: '结束行号，可选；默认读取起始行后的 80 行，最多 200 行' }
          },
          required: ['startLine']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'find_text_in_note',
        description: '在指定笔记内查找文本并返回命中行号。适合定位后再用 read_note_lines 精确读取局部内容。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' },
            query: { type: 'string', description: '要在笔记内查找的文本' },
            limit: { type: 'number', description: '返回命中数量，1-10，默认 5' }
          },
          required: ['title', 'query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'find_text_in_current_note',
        description: '在当前编辑器正在打开的笔记内查找文本并返回命中行号。适合定位后再用 read_current_note_lines 精确读取局部内容。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '要在当前笔记内查找的文本' },
            limit: { type: 'number', description: '返回命中数量，1-10，默认 5' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_vault_overview',
        description: '获取当前知识库的摘要，包括笔记、标签、任务、属性、链接、断链和孤岛笔记数量。',
        parameters: { type: 'object', properties: {} }
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
        name: 'list_current_note_links',
        description: '列出当前编辑器正在打开笔记的出链、反链和未链接提及。适合用户询问当前笔记关系或想补双链时使用。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'summarize_current_note_links',
        description: '汇总当前编辑器正在打开笔记的关系健康度，包括出链、已解析出链、断链、反链、未链接提及数量和 orphan/dead-end/unreferenced 信号。适合先判断是否需要展开 list_current_note_links。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_current_note_unlinked_references',
        description: '列出当前笔记正文中提到但尚未写成 wikilink 的已有笔记标题或 alias。适合发现可以补成 [[双向链接]] 的候选目标。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_note_headings',
        description: '列出指定笔记的 Markdown 标题目录。适合先查看长笔记结构，再用 read_note 读取某个 heading。',
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
        name: 'list_current_note_headings',
        description: '列出当前编辑器正在打开笔记的 Markdown 标题目录。适合用户询问当前笔记结构，或在读取全文前先定位章节。',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_note_blocks',
        description: '列出指定笔记中的 Obsidian block id。适合先发现块引用，再用 read_note 读取 Note#^block。',
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
        name: 'list_current_note_blocks',
        description: '列出当前编辑器正在打开笔记中的 Obsidian block id。适合先发现块引用，再用 read_current_note 或 read_note 读取 Note#^block。',
        parameters: { type: 'object', properties: {} }
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
        name: 'list_current_note_tasks',
        description: '列出当前编辑器正在打开笔记中的 Markdown 任务，默认返回未完成任务。',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'open、done 或 all，默认 open' },
            query: { type: 'string', description: '按任务文本过滤，可选' },
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
        name: 'list_folders',
        description: '列出知识库中的笔记文件夹及其笔记数量，可按文件夹路径过滤。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按文件夹路径过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_notes_by_folder',
        description: '列出指定文件夹中的笔记。folder 使用相对路径，例如 Projects 或 Daily/2026。',
        parameters: {
          type: 'object',
          properties: {
            folder: { type: 'string', description: '文件夹相对路径' },
            recursive: { type: 'boolean', description: '是否包含子文件夹，默认 true' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          },
          required: ['folder']
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
        name: 'list_property_values',
        description: '列出指定结构化属性的不同取值、数量和样例路径。',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: '属性键，例如 status、priority、tags' },
            query: { type: 'string', description: '按属性值过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          },
          required: ['key']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_notes_missing_property',
        description: '列出缺少指定结构化属性或属性值为空的笔记，适合补齐 status、source、priority 等元数据。',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: '属性键，例如 status、source、priority' },
            query: { type: 'string', description: '按标题或路径过滤，可选' },
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
    {
      type: 'function',
      function: {
        name: 'list_orphan_notes',
        description: '列出没有 resolved 出链且没有反链的孤岛笔记，可按标题或路径过滤。',
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
        name: 'list_unreferenced_notes',
        description: '列出没有任何反链的笔记，可按标题或路径过滤，帮助把笔记接回知识网络。',
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
        name: 'list_dead_end_notes',
        description: '列出没有已解析出链的终点笔记，可按标题或路径过滤，帮助发现需要继续延展或补链接的内容。',
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
        name: 'list_link_hubs',
        description: '列出链接最多的枢纽笔记，可按反链、出链或总连接数排序，帮助理解知识库结构。',
        parameters: {
          type: 'object',
          properties: {
            mode: { type: 'string', description: 'backlinks、outgoing 或 total，默认 total' },
            query: { type: 'string', description: '按标题或路径过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_knowledge_bridges',
        description: '列出连接多个文件夹或标签簇的桥梁笔记，帮助发现跨主题综合节点和优先维护对象。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按标题、路径、相邻文件夹或相邻标签过滤，可选' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'plan_knowledge_maintenance',
        description: '生成下一步知识库维护队列，按断链、孤岛、未链接引用和知识桥梁等信号排序，适合回答“我接下来该整理什么”。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按标题、路径、动作、原因或细节过滤，可选' },
            limit: { type: 'number', description: '返回维护动作数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_untagged_notes',
        description: '列出没有任何标签的笔记，可按标题或路径过滤。',
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
        name: 'list_empty_notes',
        description: '列出没有正文内容的空壳或占位笔记，可按标题或路径过滤。',
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
        name: 'list_large_notes',
        description: '列出字符数较多的长笔记，便于建议拆分、提炼或建立索引。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按标题或路径过滤，可选' },
            minCharacters: { type: 'number', description: '最小字符数，默认 8000，最低 1000' },
            limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_duplicate_note_titles',
        description: '列出标题重复的笔记及其路径，帮助避免 read_note 歧义。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按标题或路径过滤，可选' },
            limit: { type: 'number', description: '返回重复标题组数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_duplicate_aliases',
        description: '列出被多个笔记共用的 alias，帮助排查 read_note 和 wikilink 解析歧义。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '按 alias、标题或路径过滤，可选' },
            limit: { type: 'number', description: '返回重复 alias 组数量，1-10，默认 5' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_note',
        description: '当用户要求在普通 Agent 对话中直接创建笔记时调用。此工具不会写文件，只会返回切换到编辑模式的安全引导。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '用户想创建的笔记标题，可选' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'edit_note',
        description: '当用户要求在普通 Agent 对话中直接修改笔记时调用。此工具不会写文件，只会返回切换到编辑模式的安全引导。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '用户想修改的笔记标题、路径或当前笔记，可选' }
          }
        }
      }
    },
  ]

  async function executeToolCall(
    name: string,
    args: Record<string, unknown>,
    vaultPath: string,
    currentFilePath?: string | null
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
      case 'find_similar_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const threshold = normalizeSimilarityThreshold(args.threshold)
        const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
        const pairs = findSimilarNotes(vaultPath, Math.max(3, limit), threshold)
          .map((pair) => {
            const source = notesById.get(pair.sourceId)
            const target = notesById.get(pair.targetId)
            if (!source || !target) return null
            return {
              sourceTitle: source.title || pair.sourceTitle,
              sourcePath: source.filePath,
              targetTitle: target.title || pair.targetTitle,
              targetPath: target.filePath,
              score: pair.score
            }
          })
          .filter((pair): pair is { sourceTitle: string; sourcePath: string; targetTitle: string; targetPath: string; score: number } => pair !== null)
          .filter((pair) => !query || [pair.sourceTitle, pair.sourcePath, pair.targetTitle, pair.targetPath].some((value) => value.toLowerCase().includes(query)))
          .sort((a, b) => b.score - a.score || a.sourcePath.localeCompare(b.sourcePath) || a.targetPath.localeCompare(b.targetPath))
          .slice(0, limit)
        return {
          content: formatSimilarNotesToolResult(pairs),
          sources: pairs.flatMap((pair) => [
            {
              title: pair.sourceTitle,
              filePath: pair.sourcePath,
              chunk: `Similar to ${pair.targetTitle}: ${pair.score.toFixed(3)}`,
              score: pair.score
            },
            {
              title: pair.targetTitle,
              filePath: pair.targetPath,
              chunk: `Similar to ${pair.sourceTitle}: ${pair.score.toFixed(3)}`,
              score: pair.score
            }
          ])
        }
      }
      case 'find_memory_related_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const threshold = normalizeMemoryRelationThreshold(args.threshold)
        const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
        const memories = readAllMemories(vaultPath)
        if (memories.length < 2) {
          return { content: 'No note memories found. Generate note memories before using find_memory_related_notes.' }
        }
        const pairs = findRelatedByMemory(vaultPath, Math.max(3, limit))
          .map((pair) => {
            const source = notesById.get(pair.sourceId)
            const target = notesById.get(pair.targetId)
            if (!source || !target) return null
            return {
              sourceTitle: source.title || pair.sourceTitle,
              sourcePath: source.filePath,
              targetTitle: target.title || pair.targetTitle,
              targetPath: target.filePath,
              score: pair.score,
              reason: pair.reason
            }
          })
          .filter((pair): pair is { sourceTitle: string; sourcePath: string; targetTitle: string; targetPath: string; score: number; reason: string } => pair !== null)
          .filter((pair) => pair.score >= threshold)
          .filter((pair) => !query || [pair.sourceTitle, pair.sourcePath, pair.targetTitle, pair.targetPath, pair.reason].some((value) => value.toLowerCase().includes(query)))
          .sort((a, b) => b.score - a.score || a.sourcePath.localeCompare(b.sourcePath) || a.targetPath.localeCompare(b.targetPath))
          .slice(0, limit)
        return {
          content: formatMemoryRelatedNotesToolResult(pairs),
          sources: pairs.flatMap((pair) => [
            {
              title: pair.sourceTitle,
              filePath: pair.sourcePath,
              chunk: `${pair.reason}; related to ${pair.targetTitle}`,
              score: pair.score
            },
            {
              title: pair.targetTitle,
              filePath: pair.targetPath,
              chunk: `${pair.reason}; related to ${pair.sourceTitle}`,
              score: pair.score
            }
          ])
        }
      }
      case 'find_connection_opportunities': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
        const outgoingLinksByNoteId = new Map(notes.map((note) => [note.id, getOutgoingLinks(vaultPath, note.id)]))
        const pairs = findConnectionOpportunities({
          notes,
          propertyRows: getPropertyRows(vaultPath),
          memories: readAllMemories(vaultPath),
          outgoingLinksByNoteId,
          query,
          limit
        })
        return {
          content: formatConnectionOpportunitiesToolResult(pairs),
          sources: pairs.flatMap((pair) => [
            {
              title: pair.sourceTitle,
              filePath: pair.sourcePath,
              chunk: `Connection opportunity with ${pair.targetTitle}: ${pair.reasons.join('; ')}`.slice(0, 100),
              score: pair.score
            },
            {
              title: pair.targetTitle,
              filePath: pair.targetPath,
              chunk: `Connection opportunity with ${pair.sourceTitle}: ${pair.reasons.join('; ')}`.slice(0, 100),
              score: pair.score
            }
          ])
        }
      }
      case 'list_note_memories': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
        const memories = readAllMemories(vaultPath)
          .map((memory) => {
            const note = notesById.get(memory.noteId)
            if (!note) return null
            return {
              title: note.title || memory.title,
              filePath: note.filePath,
              folder: memory.folder,
              concepts: memory.concepts,
              topics: memory.topics,
              summary: memory.summary,
              updatedAt: memory.updatedAt
            }
          })
          .filter((memory): memory is { title: string; filePath: string; folder: string; concepts: string[]; topics: string[]; summary: string; updatedAt: number } => memory !== null)
          .filter((memory) => {
            if (!query) return true
            return [
              memory.title,
              memory.filePath,
              memory.folder,
              memory.summary,
              ...memory.concepts,
              ...memory.topics
            ].some((value) => value.toLowerCase().includes(query))
          })
          .sort((a, b) => b.updatedAt - a.updatedAt || a.filePath.localeCompare(b.filePath))
          .slice(0, limit)
        return {
          content: formatNoteMemoriesToolResult(memories),
          sources: memories.map((memory) => ({
            title: memory.title,
            filePath: memory.filePath,
            chunk: memory.summary.slice(0, 100),
            score: 1
          }))
        }
      }
      case 'get_memory_overview': {
        const notes = getAllNotes(vaultPath)
        const notesById = new Map(notes.map((note) => [note.id, note]))
        const memories = readAllMemories(vaultPath)
        const memoryNoteIds = new Set<string>()
        const concepts = new Set<string>()
        const topics = new Set<string>()
        let current = 0
        let stale = 0
        let orphanMemories = 0
        for (const memory of memories) {
          const note = notesById.get(memory.noteId)
          if (!note) {
            orphanMemories += 1
            continue
          }
          memoryNoteIds.add(memory.noteId)
          if (memory.contentHash === note.contentHash) current += 1
          else stale += 1
          for (const concept of memory.concepts) {
            const normalized = concept.trim().toLowerCase()
            if (normalized) concepts.add(normalized)
          }
          for (const topic of memory.topics) {
            const normalized = topic.trim().toLowerCase()
            if (normalized) topics.add(normalized)
          }
        }
        return {
          content: formatMemoryOverviewToolResult({
            notes: notes.length,
            memories: memoryNoteIds.size,
            current,
            stale,
            missing: notes.length - memoryNoteIds.size,
            orphanMemories,
            concepts: concepts.size,
            topics: topics.size
          })
        }
      }
      case 'list_memory_folders': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const folders = new Map<string, { path: string; notes: number; current: number; stale: number; missing: number }>()
        for (const note of getAllNotes(vaultPath)) {
          const path = getNoteFolderPath(note.filePath) || '_root'
          const folder = folders.get(path) || { path, notes: 0, current: 0, stale: 0, missing: 0 }
          folder.notes += 1
          const memory = readMemory(vaultPath, note.id)
          if (!memory) folder.missing += 1
          else if (memory.contentHash === note.contentHash) folder.current += 1
          else folder.stale += 1
          folders.set(path, folder)
        }
        const rows = Array.from(folders.values())
          .filter((folder) => !query || folder.path.toLowerCase().includes(query))
          .sort((a, b) => b.missing - a.missing || b.stale - a.stale || b.notes - a.notes || a.path.localeCompare(b.path))
          .slice(0, limit)
        return { content: formatMemoryFoldersToolResult(rows) }
      }
      case 'list_memory_terms': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const type = getStringArg(args, 'type').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
        const groups = new Map<string, { term: string; type: 'concept' | 'topic'; count: number; samplePaths: string[] }>()
        const addTerms = (terms: string[], termType: 'concept' | 'topic', filePath: string) => {
          for (const rawTerm of new Set(terms.map((term) => term.trim()).filter(Boolean))) {
            const key = `${termType}:${rawTerm.toLowerCase()}`
            const group = groups.get(key) || { term: rawTerm, type: termType, count: 0, samplePaths: [] }
            group.count += 1
            if (group.samplePaths.length < 3 && !group.samplePaths.includes(filePath)) {
              group.samplePaths.push(filePath)
            }
            groups.set(key, group)
          }
        }
        for (const memory of readAllMemories(vaultPath)) {
          const note = notesById.get(memory.noteId)
          if (!note) continue
          if (type !== 'topic') addTerms(memory.concepts, 'concept', note.filePath)
          if (type !== 'concept') addTerms(memory.topics, 'topic', note.filePath)
        }
        const terms = Array.from(groups.values())
          .filter((term) => !query || term.term.toLowerCase().includes(query))
          .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type) || a.term.localeCompare(b.term))
          .slice(0, limit)
        return {
          content: formatMemoryTermsToolResult(terms),
          sources: terms.flatMap((term) => term.samplePaths.map((filePath) => ({
            title: term.term,
            filePath,
            chunk: `${term.type}: ${term.term}`,
            score: term.count
          })))
        }
      }
      case 'list_memory_term_pairs': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const type = getStringArg(args, 'type').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
        const pairs = new Map<string, { first: string; second: string; type: 'concept' | 'topic' | 'mixed'; count: number; samplePaths: string[] }>()
        const addPair = (first: string, second: string, pairType: 'concept' | 'topic' | 'mixed', filePath: string) => {
          const ordered = [first, second].sort((a, b) => a.localeCompare(b))
          const key = `${pairType}:${ordered[0].toLowerCase()}\u0000${ordered[1].toLowerCase()}`
          const pair = pairs.get(key) || { first: ordered[0], second: ordered[1], type: pairType, count: 0, samplePaths: [] }
          pair.count += 1
          if (pair.samplePaths.length < 3 && !pair.samplePaths.includes(filePath)) {
            pair.samplePaths.push(filePath)
          }
          pairs.set(key, pair)
        }
        const addPairs = (terms: string[], pairType: 'concept' | 'topic', filePath: string) => {
          const unique = Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)))
          for (let i = 0; i < unique.length; i++) {
            for (let j = i + 1; j < unique.length; j++) addPair(unique[i], unique[j], pairType, filePath)
          }
        }
        for (const memory of readAllMemories(vaultPath)) {
          const note = notesById.get(memory.noteId)
          if (!note) continue
          const concepts = Array.from(new Set(memory.concepts.map((term) => term.trim()).filter(Boolean)))
          const topics = Array.from(new Set(memory.topics.map((term) => term.trim()).filter(Boolean)))
          if (type !== 'topic' && type !== 'mixed') addPairs(concepts, 'concept', note.filePath)
          if (type !== 'concept' && type !== 'mixed') addPairs(topics, 'topic', note.filePath)
          if (type !== 'concept' && type !== 'topic') {
            for (const concept of concepts) {
              for (const topic of topics) addPair(concept, topic, 'mixed', note.filePath)
            }
          }
        }
        const rows = Array.from(pairs.values())
          .filter((pair) => !query || [pair.first, pair.second].some((term) => term.toLowerCase().includes(query)))
          .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type) || a.first.localeCompare(b.first) || a.second.localeCompare(b.second))
          .slice(0, limit)
        return {
          content: formatMemoryTermPairsToolResult(rows),
          sources: rows.flatMap((pair) => pair.samplePaths.map((filePath) => ({
            title: `${pair.first} + ${pair.second}`,
            filePath,
            chunk: `${pair.type}: ${pair.first} + ${pair.second}`,
            score: pair.count
          })))
        }
      }
      case 'list_notes_by_memory_term': {
        const term = getStringArg(args, 'term').trim()
        if (!term) return { content: 'list_notes_by_memory_term 缺少 term 参数。请提供要查询的概念或主题。' }
        const type = getStringArg(args, 'type').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const termLower = term.toLowerCase()
        const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
        const notes = readAllMemories(vaultPath)
          .map((memory) => {
            const note = notesById.get(memory.noteId)
            if (!note) return null
            const conceptMatches = type !== 'topic'
              ? memory.concepts.filter((concept) => concept.toLowerCase() === termLower)
              : []
            const topicMatches = type !== 'concept'
              ? memory.topics.filter((topic) => topic.toLowerCase() === termLower)
              : []
            const matchedTerms = [...conceptMatches, ...topicMatches]
            if (matchedTerms.length === 0) return null
            return {
              title: note.title || memory.title,
              filePath: note.filePath,
              matchedTerms,
              summary: memory.summary,
              updatedAt: memory.updatedAt
            }
          })
          .filter((note): note is { title: string; filePath: string; matchedTerms: string[]; summary: string; updatedAt: number } => note !== null)
          .sort((a, b) => b.updatedAt - a.updatedAt || a.filePath.localeCompare(b.filePath))
          .slice(0, limit)
        return {
          content: formatNotesByMemoryTermToolResult(term, notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: note.summary.slice(0, 100),
            score: note.matchedTerms.length
          }))
        }
      }
      case 'list_notes_missing_memory': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const status = getStringArg(args, 'status').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
          .map((note) => {
            const memory = readMemory(vaultPath, note.id)
            const reason = memory ? (memory.contentHash === note.contentHash ? null : 'stale') : 'missing'
            if (!reason) return null
            return {
              title: note.title,
              filePath: note.filePath,
              updatedAt: note.updatedAt,
              reason
            }
          })
          .filter((note): note is { title: string; filePath: string; updatedAt: number; reason: 'missing' | 'stale' } => note !== null)
          .filter((note) => status === 'missing' || status === 'stale' ? note.reason === status : true)
          .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
          .sort((a, b) => b.updatedAt - a.updatedAt || a.filePath.localeCompare(b.filePath))
          .slice(0, limit)
        return {
          content: formatMissingMemoryNotesToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Memory ${note.reason}`,
            score: 1
          }))
        }
      }
      case 'read_note_memory': {
        const title = getStringArg(args, 'title')
        if (!title.trim()) return { content: 'read_note_memory 缺少 title 参数。请先搜索笔记，或提供要读取 memory 的笔记标题。' }
        const note = findNoteForAiTool(vaultPath, title)
        if (!note) {
          const candidates = findNoteCandidatesForAiTool(vaultPath, title)
          if (candidates.length > 1) {
            return {
              content: `找到多个可能的笔记，请用 read_note_memory 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
            }
          }
          return { content: `未找到标题为「${title}」的笔记。` }
        }
        const indexedNote = getAllNotes(vaultPath).find((item) => item.filePath === note.filePath)
        if (!indexedNote) return { content: `未找到笔记「${note.title}」的索引记录。` }
        const memory = readMemory(vaultPath, indexedNote.id)
        if (!memory) return { content: `No memory found for ${note.title} (${note.filePath}).` }
        const status = memory.contentHash === indexedNote.contentHash ? 'current' : 'stale'
        return {
          content: formatReadNoteMemoryToolResult({
            title: note.title,
            filePath: note.filePath,
            folder: memory.folder,
            concepts: memory.concepts,
            topics: memory.topics,
            summary: memory.summary,
            updatedAt: memory.updatedAt,
            status
          }),
          sources: [{
            title: note.title,
            filePath: note.filePath,
            chunk: memory.summary.slice(0, 100),
            score: status === 'current' ? 1 : 0.5
          }]
        }
      }
      case 'read_current_note_memory': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 read_note_memory 指定标题/路径。' }
        return executeToolCall('read_note_memory', { title: currentFilePath }, vaultPath, currentFilePath)
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
      case 'read_current_note': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 read_note 指定标题/路径。' }
        return executeToolCall('read_note', { title: currentFilePath }, vaultPath, currentFilePath)
      }
      case 'read_current_note_properties': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_properties 查询全库属性。' }
        const note = findNoteForAiTool(vaultPath, currentFilePath)
        if (!note) return { content: `未找到当前笔记「${currentFilePath}」的索引记录。请先刷新索引。` }
        const row = getPropertyRows(vaultPath).find((item) => item.filePath === note.filePath)
        if (!row) return { content: `未找到当前笔记「${note.filePath}」的属性索引。请先刷新索引。` }
        const properties = Object.entries(row.properties)
          .map(([key, value]) => ({ key, value: formatPropertyValue(value).trim() }))
          .filter((property) => property.value.length > 0)
          .sort((a, b) => a.key.localeCompare(b.key))
        return {
          content: formatCurrentNotePropertiesToolResult({ title: row.title, filePath: row.filePath, properties }),
          sources: [{
            title: row.title,
            filePath: row.filePath,
            chunk: properties.slice(0, 5).map((property) => `${property.key}: ${property.value}`).join('\n').slice(0, 100),
            score: 1
          }]
        }
      }
      case 'read_note_lines': {
        const title = getStringArg(args, 'title')
        const startLineArg = getPositiveIntegerArg(args.startLine)
        if (!title.trim()) return { content: 'read_note_lines 缺少 title 参数。请先搜索笔记，或提供要读取的笔记标题。' }
        if (!startLineArg) return { content: 'read_note_lines 缺少有效的 startLine 参数。请提供从 1 开始的行号。' }
        const note = findNoteForAiTool(vaultPath, title)
        if (!note) {
          const candidates = findNoteCandidatesForAiTool(vaultPath, title)
          if (candidates.length > 1) {
            return {
              content: `找到多个可能的笔记，请用 read_note_lines 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
            }
          }
          return { content: `未找到标题为「${title}」的笔记。` }
        }
        try {
          const content = readFileSync(note.absolutePath, 'utf-8')
          const lines = content.split('\n')
          const startLine = Math.min(startLineArg, lines.length || 1)
          const requestedEndLine = getPositiveIntegerArg(args.endLine) || startLine + 79
          const endLine = Math.min(lines.length || 1, Math.max(startLine, requestedEndLine), startLine + 199)
          const selectedContent = lines.slice(startLine - 1, endLine).join('\n')
          return {
            content: formatReadNoteLinesToolResult({ title: note.title, filePath: note.filePath, content: selectedContent, startLine, endLine }),
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
      case 'read_current_note_lines': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 read_note_lines 指定标题/路径。' }
        return executeToolCall('read_note_lines', { ...args, title: currentFilePath }, vaultPath, currentFilePath)
      }
      case 'find_text_in_note': {
        const title = getStringArg(args, 'title')
        const query = getStringArg(args, 'query').trim()
        if (!title.trim()) return { content: 'find_text_in_note 缺少 title 参数。请先搜索笔记，或提供要查找的笔记标题。' }
        if (!query) return { content: 'find_text_in_note 缺少 query 参数。请提供要在笔记中查找的文本。' }
        const note = findNoteForAiTool(vaultPath, title)
        if (!note) {
          const candidates = findNoteCandidatesForAiTool(vaultPath, title)
          if (candidates.length > 1) {
            return {
              content: `找到多个可能的笔记，请用 find_text_in_note 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
            }
          }
          return { content: `未找到标题为「${title}」的笔记。` }
        }
        try {
          const content = readFileSync(note.absolutePath, 'utf-8')
          const needle = query.toLowerCase()
          const limit = normalizeToolLimit(args.limit)
          const matches = content.split('\n')
            .map((line, index) => ({ line: index + 1, context: line.trim() }))
            .filter((match) => match.context.toLowerCase().includes(needle))
            .slice(0, limit)
          return {
            content: formatFindTextInNoteToolResult({ title: note.title, filePath: note.filePath, query, matches }),
            sources: matches.map((match) => ({
              title: note.title,
              filePath: note.filePath,
              chunk: `Line ${match.line}: ${match.context}`.slice(0, 100),
              score: 1
            }))
          }
        } catch {
          return { content: `无法读取笔记「${title}」。` }
        }
      }
      case 'find_text_in_current_note': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 find_text_in_note 指定标题/路径。' }
        return executeToolCall('find_text_in_note', { ...args, title: currentFilePath }, vaultPath, currentFilePath)
      }
      case 'get_vault_overview': {
        const notes = getAllNotes(vaultPath)
        const tasks = getAllTasks(vaultPath)
        const propertyKeys = new Set<string>()
        for (const row of getPropertyRows(vaultPath)) {
          Object.keys(row.properties).forEach((key) => propertyKeys.add(key))
        }
        let resolvedLinks = 0
        let unresolvedLinks = 0
        let orphanNotes = 0
        for (const note of notes) {
          const outgoing = getOutgoingLinks(vaultPath, note.id)
          const hasResolvedOutgoing = outgoing.some((link) => link.resolved)
          const hasBacklinks = getBacklinks(vaultPath, note.id).length > 0
          resolvedLinks += outgoing.filter((link) => link.resolved).length
          unresolvedLinks += outgoing.filter((link) => !link.resolved).length
          if (!hasResolvedOutgoing && !hasBacklinks) orphanNotes += 1
        }
        return {
          content: formatVaultOverviewToolResult({
            notes: notes.length,
            tags: getAllTags(vaultPath).length,
            properties: propertyKeys.size,
            tasksOpen: tasks.filter((task) => !task.done).length,
            tasksDone: tasks.filter((task) => task.done).length,
            resolvedLinks,
            unresolvedLinks,
            orphanNotes
          })
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
      case 'list_current_note_links': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_links 指定标题/路径。' }
        return executeToolCall('list_note_links', { title: currentFilePath }, vaultPath, currentFilePath)
      }
      case 'summarize_current_note_links': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_links 指定标题/路径。' }
        const note = findNoteForAiTool(vaultPath, currentFilePath)
        if (!note) return { content: `未找到当前笔记「${currentFilePath}」的索引记录。请先刷新索引。` }
        const db = getDatabase(vaultPath)
        const row = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(note.filePath) as { id: string } | undefined
        if (!row) return { content: `未找到笔记索引「${note.filePath}」。请先刷新索引。` }
        const outgoing = getOutgoingLinks(vaultPath, row.id)
        const backlinks = getBacklinks(vaultPath, row.id)
        const unlinkedMentions = getUnlinkedMentions(vaultPath, row.id)
        const resolvedOutgoing = outgoing.filter((link) => link.resolved).length
        const unresolvedOutgoing = outgoing.length - resolvedOutgoing
        return {
          content: formatCurrentNoteLinkStatsToolResult({
            title: note.title,
            filePath: note.filePath,
            outgoing: outgoing.length,
            resolvedOutgoing,
            unresolvedOutgoing,
            backlinks: backlinks.length,
            unlinkedMentions: unlinkedMentions.length
          }),
          sources: [{
            title: note.title,
            filePath: note.filePath,
            chunk: `Outgoing: ${outgoing.length}; Backlinks: ${backlinks.length}; Unlinked mentions: ${unlinkedMentions.length}`,
            score: 1
          }]
        }
      }
      case 'list_current_note_unlinked_references': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_links 指定标题/路径。' }
        const note = findNoteForAiTool(vaultPath, currentFilePath)
        if (!note) return { content: `未找到当前笔记「${currentFilePath}」的索引记录。请先刷新索引。` }
        const db = getDatabase(vaultPath)
        const row = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(note.filePath) as { id: string } | undefined
        if (!row) return { content: `未找到笔记索引「${note.filePath}」。请先刷新索引。` }
        const references = getOutgoingUnlinkedMentions(vaultPath, row.id)
        return {
          content: formatCurrentNoteUnlinkedReferencesToolResult({ title: note.title, filePath: note.filePath, references }),
          sources: references.map((reference) => ({
            title: reference.targetTitle,
            filePath: reference.targetPath,
            chunk: reference.context,
            score: 1
          }))
        }
      }
      case 'list_note_headings': {
        const title = getStringArg(args, 'title')
        if (!title.trim()) return { content: 'list_note_headings 缺少 title 参数。请先搜索笔记，或提供要查看目录的笔记标题。' }
        const note = findNoteForAiTool(vaultPath, title)
        if (!note) {
          const candidates = findNoteCandidatesForAiTool(vaultPath, title)
          if (candidates.length > 1) {
            return {
              content: `找到多个可能的笔记，请用 list_note_headings 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
            }
          }
          return { content: `未找到标题为「${title}」的笔记。` }
        }
        try {
          const headings = extractMarkdownHeadings(readFileSync(note.absolutePath, 'utf-8'))
          return {
            content: formatNoteHeadingsToolResult({ title: note.title, filePath: note.filePath, headings }),
            sources: [{
              title: note.title,
              filePath: note.filePath,
              chunk: `${headings.length} headings`,
              score: 1
            }]
          }
        } catch {
          return { content: `无法读取笔记「${title}」。` }
        }
      }
      case 'list_current_note_headings': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_headings 指定标题/路径。' }
        return executeToolCall('list_note_headings', { title: currentFilePath }, vaultPath, currentFilePath)
      }
      case 'list_note_blocks': {
        const title = getStringArg(args, 'title')
        if (!title.trim()) return { content: 'list_note_blocks 缺少 title 参数。请先搜索笔记，或提供要查看块引用的笔记标题。' }
        const note = findNoteForAiTool(vaultPath, title)
        if (!note) {
          const candidates = findNoteCandidatesForAiTool(vaultPath, title)
          if (candidates.length > 1) {
            return {
              content: `找到多个可能的笔记，请用 list_note_blocks 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
            }
          }
          return { content: `未找到标题为「${title}」的笔记。` }
        }
        try {
          const blocks = extractMarkdownBlockReferences(readFileSync(note.absolutePath, 'utf-8'))
          return {
            content: formatNoteBlocksToolResult({ title: note.title, filePath: note.filePath, blocks }),
            sources: [{
              title: note.title,
              filePath: note.filePath,
              chunk: `${blocks.length} block references`,
              score: 1
            }]
          }
        } catch {
          return { content: `无法读取笔记「${title}」。` }
        }
      }
      case 'list_current_note_blocks': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_blocks 指定标题/路径。' }
        return executeToolCall('list_note_blocks', { title: currentFilePath }, vaultPath, currentFilePath)
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
      case 'list_current_note_tasks': {
        if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_tasks 查询全库任务。' }
        const note = findNoteForAiTool(vaultPath, currentFilePath)
        if (!note) return { content: `未找到当前笔记「${currentFilePath}」的索引记录。请先刷新索引。` }
        const status = getStringArg(args, 'status').trim().toLowerCase()
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const tasks = getAllTasks(vaultPath)
          .filter((task) => task.filePath === note.filePath)
          .filter((task) => {
            if (status === 'done') return task.done
            if (status === 'all') return true
            return !task.done
          })
          .filter((task) => !query || task.text.toLowerCase().includes(query))
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
      case 'list_folders': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const counts = new Map<string, number>()
        for (const note of getAllNotes(vaultPath)) {
          const folder = getNoteFolderPath(note.filePath)
          if (!folder) continue
          counts.set(folder, (counts.get(folder) || 0) + 1)
        }
        const folders = Array.from(counts.entries())
          .map(([path, count]) => ({ path, count }))
          .filter((folder) => !query || folder.path.toLowerCase().includes(query))
          .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
          .slice(0, limit)
        return { content: formatListFoldersToolResult(folders) }
      }
      case 'list_notes_by_folder': {
        const folder = normalizeFolderArg(getStringArg(args, 'folder'))
        if (!folder) return { content: 'list_notes_by_folder 缺少 folder 参数。请提供要查询的文件夹路径。' }
        const recursive = args.recursive !== false
        const prefix = `${folder}/`
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
          .filter((note) => {
            const path = note.filePath
            if (recursive) return path.startsWith(prefix)
            return getNoteFolderPath(path) === folder
          })
          .slice(0, limit)
        return {
          content: formatNotesByFolderToolResult(folder, notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Folder: ${folder}`,
            score: 1
          }))
        }
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
      case 'list_property_values': {
        const key = getStringArg(args, 'key').trim()
        if (!key) return { content: 'list_property_values 缺少 key 参数。请提供要查询的属性键。' }
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const values = new Map<string, { value: string; count: number; samplePaths: string[] }>()
        for (const row of getPropertyRows(vaultPath)) {
          const matchedKey = Object.keys(row.properties).find((propertyKey) => propertyKey.toLowerCase() === key.toLowerCase())
          if (!matchedKey) continue
          const raw = row.properties[matchedKey]
          const rawValues = Array.isArray(raw) ? raw : [raw]
          for (const value of rawValues) {
            const text = formatPropertyValue(value).trim()
            if (!text || (query && !text.toLowerCase().includes(query))) continue
            const current = values.get(text) || { value: text, count: 0, samplePaths: [] }
            current.count += 1
            if (!current.samplePaths.includes(row.filePath) && current.samplePaths.length < 3) {
              current.samplePaths.push(row.filePath)
            }
            values.set(text, current)
          }
        }
        const summaries = Array.from(values.values())
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
          .slice(0, limit)
        return { content: formatPropertyValuesToolResult(key, summaries) }
      }
      case 'list_notes_missing_property': {
        const key = getStringArg(args, 'key').trim()
        if (!key) return { content: 'list_notes_missing_property 缺少 key 参数。请提供要检查的属性键。' }
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getPropertyRows(vaultPath)
          .filter((row) => !hasNonEmptyProperty(row.properties, key))
          .filter((row) => !query || [row.title, row.filePath].some((value) => value.toLowerCase().includes(query)))
          .map((row) => ({ title: row.title, filePath: row.filePath, updatedAt: row.updatedAt }))
          .slice(0, limit)
        return {
          content: formatMissingPropertyNotesToolResult(key, notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Missing property: ${key}`,
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
      case 'list_orphan_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
          .filter((note) => {
            const hasResolvedOutgoing = getOutgoingLinks(vaultPath, note.id).some((link) => link.resolved)
            const hasBacklinks = getBacklinks(vaultPath, note.id).length > 0
            return !hasResolvedOutgoing && !hasBacklinks
          })
          .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
          .slice(0, limit)
        return {
          content: formatOrphanNotesToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: 'Orphan note: no resolved outgoing links or backlinks',
            score: 1
          }))
        }
      }
      case 'list_unreferenced_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
          .filter((note) => getBacklinks(vaultPath, note.id).length === 0)
          .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
          .slice(0, limit)
        return {
          content: formatUnreferencedNotesToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: 'Unreferenced note: no backlinks',
            score: 1
          }))
        }
      }
      case 'list_dead_end_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
          .filter((note) => !getOutgoingLinks(vaultPath, note.id).some((link) => link.resolved))
          .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
          .slice(0, limit)
        return {
          content: formatDeadEndNotesToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: 'Dead-end note: no resolved outgoing links',
            score: 1
          }))
        }
      }
      case 'list_link_hubs': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const mode = normalizeLinkHubMode(getStringArg(args, 'mode').trim().toLowerCase())
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
          .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
          .map((note) => {
            const backlinks = getBacklinks(vaultPath, note.id).length
            const outgoing = getOutgoingLinks(vaultPath, note.id).filter((link) => link.resolved).length
            return { title: note.title, filePath: note.filePath, backlinks, outgoing, total: backlinks + outgoing }
          })
          .filter((note) => note.total > 0)
          .sort((a, b) => b[mode] - a[mode] || b.total - a.total || a.title.localeCompare(b.title))
          .slice(0, limit)
        return {
          content: formatLinkHubsToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Backlinks: ${note.backlinks}; outgoing: ${note.outgoing}; total: ${note.total}`,
            score: note.total
          }))
        }
      }
      case 'list_knowledge_bridges': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
        const outgoingLinksByNoteId = new Map(notes.map((note) => [note.id, getOutgoingLinks(vaultPath, note.id)]))
        const bridges = findKnowledgeBridgeNotes({
          notes,
          outgoingLinksByNoteId,
          propertyRows: getPropertyRows(vaultPath),
          query,
          limit
        })
        return {
          content: formatKnowledgeBridgesToolResult(bridges),
          sources: bridges.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Bridge score: ${note.score}; folders: ${note.folders.join(', ')}; tags: ${note.tags.join(', ')}`.slice(0, 100),
            score: note.score
          }))
        }
      }
      case 'plan_knowledge_maintenance': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
        const propertyRows = getPropertyRows(vaultPath)
        const outgoingLinksByNoteId = new Map(notes.map((note) => [note.id, getOutgoingLinks(vaultPath, note.id)]))
        const titleGroups = new Map<string, { title: string; filePaths: string[] }>()
        for (const note of notes) {
          const key = note.title.trim().toLowerCase()
          if (!key) continue
          const group = titleGroups.get(key) || { title: note.title, filePaths: [] }
          group.filePaths.push(note.filePath)
          titleGroups.set(key, group)
        }
        const duplicateTitleCountByPath = new Map<string, number>()
        for (const group of titleGroups.values()) {
          if (group.filePaths.length < 2) continue
          for (const filePath of group.filePaths) duplicateTitleCountByPath.set(filePath, group.filePaths.length)
        }
        const aliasGroups = new Map<string, { alias: string; filePaths: string[] }>()
        for (const row of propertyRows) {
          for (const alias of getPropertyTextValues(row.properties.aliases)) {
            const key = alias.toLowerCase()
            const group = aliasGroups.get(key) || { alias, filePaths: [] }
            group.filePaths.push(row.filePath)
            aliasGroups.set(key, group)
          }
        }
        const duplicateAliasesByPath = new Map<string, string[]>()
        for (const group of aliasGroups.values()) {
          if (group.filePaths.length < 2) continue
          for (const filePath of group.filePaths) duplicateAliasesByPath.set(filePath, [...(duplicateAliasesByPath.get(filePath) || []), group.alias])
        }
        const bridges = findKnowledgeBridgeNotes({
          notes,
          outgoingLinksByNoteId,
          propertyRows,
          limit: Math.max(limit, 10)
        })
        const items = buildKnowledgeMaintenanceQueue({
          notes,
          outgoingLinksByNoteId,
          backlinkCountByNoteId: new Map(notes.map((note) => [note.id, getBacklinks(vaultPath, note.id).length])),
          unlinkedMentionCountByNoteId: new Map(notes.map((note) => [note.id, getUnlinkedMentions(vaultPath, note.id).length])),
          memoryStatusByNoteId: new Map(notes.flatMap<[string, 'missing' | 'stale']>((note) => {
            const memory = readMemory(vaultPath, note.id)
            if (!memory) return [[note.id, 'missing' as const]]
            if (memory.contentHash !== note.contentHash) return [[note.id, 'stale' as const]]
            return []
          })),
          duplicateTitleCountByPath,
          duplicateAliasesByPath,
          bridges,
          query,
          limit
        })
        return {
          content: formatKnowledgeMaintenanceQueueToolResult(items),
          sources: items.map((item) => ({
            title: item.title,
            filePath: item.filePath,
            chunk: `${item.action}: ${item.reason}`.slice(0, 100),
            score: item.priority
          }))
        }
      }
      case 'list_untagged_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getPropertyRows(vaultPath)
          .filter((row) => !hasPropertyTags(row.properties.tags))
          .filter((row) => !query || [row.title, row.filePath].some((value) => value.toLowerCase().includes(query)))
          .map((row) => ({ title: row.title, filePath: row.filePath, updatedAt: row.updatedAt }))
          .slice(0, limit)
        return {
          content: formatUntaggedNotesToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: 'Untagged note',
            score: 1
          }))
        }
      }
      case 'list_empty_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const notes = getAllNotes(vaultPath)
          .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
          .filter((note) => {
            try {
              return isEmptyMarkdownNote(readFileSync(join(vaultPath, note.filePath), 'utf-8'))
            } catch {
              return false
            }
          })
          .slice(0, limit)
        return {
          content: formatEmptyNotesToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: 'Empty note',
            score: 1
          }))
        }
      }
      case 'list_large_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const minCharacters = normalizeMinCharacters(args.minCharacters)
        const notes = getAllNotes(vaultPath)
          .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
          .map((note) => {
            try {
              const content = readFileSync(join(vaultPath, note.filePath), 'utf-8')
              return { title: note.title, filePath: note.filePath, updatedAt: note.updatedAt, characters: content.length }
            } catch {
              return null
            }
          })
          .filter((note): note is { title: string; filePath: string; updatedAt: number; characters: number } => note !== null && note.characters >= minCharacters)
          .sort((a, b) => b.characters - a.characters || b.updatedAt - a.updatedAt)
          .slice(0, limit)
        return {
          content: formatLargeNotesToolResult(notes),
          sources: notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Large note: ${note.characters} characters`,
            score: 1
          }))
        }
      }
      case 'list_duplicate_note_titles': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const groups = new Map<string, { title: string; filePaths: string[] }>()
        for (const note of getAllNotes(vaultPath)) {
          const key = note.title.trim().toLowerCase()
          if (!key) continue
          const group = groups.get(key) || { title: note.title, filePaths: [] }
          group.filePaths.push(note.filePath)
          groups.set(key, group)
        }
        const duplicates = Array.from(groups.values())
          .filter((group) => group.filePaths.length > 1)
          .filter((group) => !query || group.title.toLowerCase().includes(query) || group.filePaths.some((filePath) => filePath.toLowerCase().includes(query)))
          .sort((a, b) => b.filePaths.length - a.filePaths.length || a.title.localeCompare(b.title))
          .slice(0, limit)
        return {
          content: formatDuplicateNoteTitlesToolResult(duplicates),
          sources: duplicates.flatMap((group) => group.filePaths.map((filePath) => ({
            title: group.title,
            filePath,
            chunk: `Duplicate title: ${group.title}`,
            score: 1
          })))
        }
      }
      case 'list_duplicate_aliases': {
        const query = getStringArg(args, 'query').trim().toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const groups = new Map<string, { alias: string; notes: { title: string; filePath: string }[] }>()
        for (const row of getPropertyRows(vaultPath)) {
          for (const alias of getPropertyTextValues(row.properties.aliases)) {
            const key = alias.toLowerCase()
            const group = groups.get(key) || { alias, notes: [] }
            group.notes.push({ title: row.title, filePath: row.filePath })
            groups.set(key, group)
          }
        }
        const duplicates = Array.from(groups.values())
          .filter((group) => group.notes.length > 1)
          .filter((group) => !query || group.alias.toLowerCase().includes(query) || group.notes.some((note) => [note.title, note.filePath].some((value) => value.toLowerCase().includes(query))))
          .sort((a, b) => b.notes.length - a.notes.length || a.alias.localeCompare(b.alias))
          .slice(0, limit)
        return {
          content: formatDuplicateAliasesToolResult(duplicates),
          sources: duplicates.flatMap((group) => group.notes.map((note) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Duplicate alias: ${group.alias}`,
            score: 1
          })))
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

  ipcMain.handle('ai:chat-agent', async (event, params: { messages: ChatMessage[]; vaultPath?: string; systemPrompt?: string; currentFilePath?: string | null }) => {
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
      messages = withMergedSystemContext(systemContent, messages)

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
}
