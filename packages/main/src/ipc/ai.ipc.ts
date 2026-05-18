import { ipcMain, BrowserWindow } from 'electron'
import { aiManager, AIProviderConfig, ChatMessage, ChatStreamEvent, ToolCallEvent } from '../services/ai'
import { store } from '../services/store'
import { semanticSearch, findSimilarNotes } from '../services/embedding'
import { listOllamaModels } from '../services/ai/ollama-provider'
import { logger } from '../services/logger'
import { indexNote, resolveAllLinks } from '../services/indexer'
import { getDatabase } from '../services/database'
import { generateMemory, readMemory, readAllMemories, findRelatedByMemory, deleteMemory } from '../services/memory'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, basename } from 'path'

const activeAbortControllers: Map<number, AbortController> = new Map()

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

  ipcMain.handle('ai:validate', async (_event, params: { config: AIProviderConfig }) => {
    const provider = aiManager.getProvider(params.config)
    return provider.validate()
  })

  ipcMain.handle('ai:chat', async (event, params: { messages: ChatMessage[]; vaultPath?: string; systemPrompt?: string; detectIntent?: boolean; intentContext?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    const windowId = window.id
    const prevController = activeAbortControllers.get(windowId)
    if (prevController) prevController.abort()

    const controller = new AbortController()
    activeAbortControllers.set(windowId, controller)

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

    if (params.detectIntent) {
      const intentInstruction = `\n\n<intent_classification>
IMPORTANT: You must output an intent tag as the VERY FIRST thing in your response, before any other text.
Based on the user's message, classify the intent and output exactly one of these tags:
- <<INTENT:graph>> — user wants to generate a knowledge graph or visualize note relationships
- <<INTENT:kanban>> — user wants to extract tasks, create a kanban board, or manage todos from notes
- <<INTENT:chat>> — normal conversation, Q&A, explanation, or anything else

Output the tag immediately, then continue with your normal response.
${params.intentContext || ''}
</intent_classification>`

      const sysIdx = messages.findIndex((m) => m.role === 'system')
      if (sysIdx >= 0) {
        messages[sysIdx] = { ...messages[sysIdx], content: (messages[sysIdx].content as string) + intentInstruction }
      } else {
        messages = [{ role: 'system', content: intentInstruction.trim() }, ...messages]
      }
    }

    try {
      for await (const chunk of aiManager.chat(messages, controller.signal)) {
        if (window.isDestroyed() || controller.signal.aborted) break
        window.webContents.send('ai:stream', chunk)
      }
    } catch (err: any) {
      if (!window.isDestroyed() && !controller.signal.aborted) {
        window.webContents.send('ai:stream', { type: 'error', content: err?.message || String(err) })
      }
    } finally {
      if (!window.isDestroyed() && !controller.signal.aborted) {
        window.webContents.send('ai:stream', { type: 'done', content: '' })
      }
      activeAbortControllers.delete(windowId)
    }
  })

  ipcMain.handle('ai:stop', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    const controller = activeAbortControllers.get(window.id)
    if (controller) {
      controller.abort()
      activeAbortControllers.delete(window.id)
    }
  })

  let completeAbort: AbortController | null = null

  ipcMain.handle('ai:complete-abort', () => {
    if (completeAbort) { completeAbort.abort(); completeAbort = null }
  })

  ipcMain.handle('ai:complete', async (_event, params: { text: string; system?: string; temperature?: number }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return ''
    if (aiManager.validateConfig(config)) return ''

    if (completeAbort) completeAbort.abort()
    completeAbort = new AbortController()
    const signal = completeAbort.signal

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

    try {
      const provider = aiManager.getProvider(config)
      let result = ''
      for await (const chunk of provider.chatStream([
        { role: 'system', content: systemPrompt },
        userMessage
      ])) {
        if (chunk.type === 'text') {
          result += chunk.content
          window.webContents.send('ai:edit-stream', { type: 'text', content: chunk.content })
        }
        if (chunk.type === 'error') {
          window.webContents.send('ai:edit-stream', { type: 'done' })
          return { success: false, error: chunk.content || 'AI 返回错误' }
        }
      }
      window.webContents.send('ai:edit-stream', { type: 'done' })
      const trimmed = result.trim()
      if (!trimmed) return { success: false, error: 'AI 未返回有效内容，请检查 API Key 配置' }
      return { success: true, content: trimmed }
    } catch (err: any) {
      window.webContents.send('ai:edit-stream', { type: 'done' })
      return { success: false, error: err?.message || String(err) }
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

    try {
      for await (const chunk of provider.chatStream([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Below are ${fileNames.length} notes. Analyze their relationships and generate a knowledge graph:\n\n${filesContent}` }
      ])) {
        if (window.isDestroyed()) break
        if (chunk.type === 'text') {
          result += chunk.content
          window.webContents.send('ai:graph-progress', { content: chunk.content })
        }
        if (chunk.type === 'error') return { success: false, error: chunk.content || 'AI 返回错误' }
      }
      window.webContents.send('ai:graph-done', {})
      return { success: true, content: result.trim() }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
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
    const prevController = activeAbortControllers.get(windowId)
    if (prevController) prevController.abort()
    const controller = new AbortController()
    activeAbortControllers.set(windowId, controller)

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
        if (chunk.type === 'error') { activeAbortControllers.delete(windowId); return { success: false, error: chunk.content, files: [] } }
      }
    } catch (err: any) {
      activeAbortControllers.delete(windowId)
      return { success: false, error: controller.signal.aborted ? '已取消' : err.message, files: [] }
    }

    if (controller.signal.aborted) { activeAbortControllers.delete(windowId); return { success: false, error: '已取消', files: [] } }

    let plan: { title: string; brief: string }[]
    try {
      const jsonStr = planResult.replace(/```json?\s*|\s*```/g, '').trim()
      const parsed = JSON.parse(jsonStr)
      plan = Array.isArray(parsed) ? parsed : (parsed.notes || parsed)
      if (!Array.isArray(plan) || plan.length === 0) throw new Error('empty')
    } catch {
      return { success: false, error: '规划解析失败，请重试', files: [] }
    }

    const targetDir = params.targetDir || params.vaultPath
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    const dirName = targetDir === params.vaultPath ? '根目录' : targetDir.split(/[\\/]/).pop() || ''

    // Strip directory name prefix from titles if AI accidentally included it
    if (dirName && dirName !== '根目录') {
      const prefixLower = dirName.toLowerCase()
      for (const item of plan) {
        const titleLower = item.title.toLowerCase()
        if (titleLower.startsWith(prefixLower) && item.title.length > dirName.length) {
          const rest = item.title.slice(dirName.length)
          if (/^[A-Z_\-\s]/.test(rest)) {
            item.title = rest.replace(/^[\s_\-]+/, '')
          }
        }
      }
    }

    window.webContents.send('ai:generate-notes-progress', { stage: 'planned', message: `将在「${dirName}」下生成 ${plan.length} 篇笔记`, plan })

    // Pre-compute safe file names for consistent wikilinks
    const safeNames = plan.map((p) => p.title.replace(/[\\/:*?"<>|]/g, '').trim())

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
        try { indexNote(params.vaultPath, fp) } catch (e: any) {
          if (!indexErr) indexErr = e?.message || String(e)
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
            const jsonStr = relResult.replace(/```json?\s*|\s*```/g, '').trim()
            const relations = JSON.parse(jsonStr) as { source: string; target: string; reason: string }[]
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

    activeAbortControllers.delete(windowId)
    const aborted = controller.signal.aborted
    window.webContents.send('ai:generate-notes-progress', { stage: 'done', message: aborted ? `已停止，已生成 ${createdFiles.length} 个文件` : `完成！已生成 ${createdFiles.length} 个文件` })
    return { success: true, files: createdFiles }
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

      const jsonStr = relResult.replace(/```json?\s*|\s*```/g, '').trim()
      const relations = JSON.parse(jsonStr) as { source: string; target: string; reason: string }[]
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
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  })

  // --- Global cross-group semantic link inference ---
  ipcMain.handle('ai:infer-global-links', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false, error: '窗口不存在' }

    const db = getDatabase(params.vaultPath)
    let added = 0

    db.prepare("DELETE FROM links WHERE link_type = 'inferred'").run()
    const insertLink = db.prepare('INSERT INTO links (source_note_id, target_title, context, link_type) VALUES (?, ?, ?, ?)')

    // Phase 1: Memory-based relation (preferred — uses pre-generated memory files)
    const memoryPairs = findRelatedByMemory(params.vaultPath, 3)
    for (const pair of memoryPairs) {
      const existing = db.prepare("SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ? AND link_type = 'explicit'").get(pair.sourceId, pair.targetTitle)
      if (!existing) {
        const reverseExisting = db.prepare("SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ? AND link_type = 'explicit'").get(pair.targetId, pair.sourceTitle)
        if (!reverseExisting) {
          insertLink.run(pair.sourceId, pair.targetTitle, pair.reason, 'inferred')
          added++
        }
      }
    }

    // Phase 2: TF-IDF fallback (for notes without memory files)
    const similarPairs = findSimilarNotes(params.vaultPath, 3, 0.75)
    for (const pair of similarPairs) {
      const existing = db.prepare("SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ?").get(pair.sourceId, pair.targetTitle)
      if (!existing) {
        const reverseExisting = db.prepare("SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ?").get(pair.targetId, pair.sourceTitle)
        if (!reverseExisting) {
          insertLink.run(pair.sourceId, pair.targetTitle, `相似度: ${(pair.score * 100).toFixed(0)}%`, 'inferred')
          added++
        }
      }
    }

    try { resolveAllLinks(params.vaultPath) } catch {}
    return { success: true, added }
  })

  ipcMain.handle('ai:generate-memories', async (event, params: { vaultPath: string }) => {
    const db = getDatabase(params.vaultPath)
    const notes = db.prepare(`
      SELECT n.id, n.title, n.file_path, n.content_hash
      FROM notes n ORDER BY n.updated_at DESC LIMIT 200
    `).all() as { id: string; title: string; file_path: string; content_hash: string }[]

    let generated = 0
    let skipped = 0

    for (const note of notes) {
      const existing = readMemory(params.vaultPath, note.id)
      if (existing && existing.contentHash === note.content_hash) {
        skipped++
        continue
      }

      const fullPath = join(params.vaultPath, note.file_path)
      if (!existsSync(fullPath)) continue

      const content = readFileSync(fullPath, 'utf-8')
      const result = await generateMemory(params.vaultPath, note.id, note.title, note.file_path, content, note.content_hash)
      if (result) generated++
    }

    return { success: true, generated, skipped, total: notes.length }
  })

  ipcMain.handle('ai:get-system-prompt', () => {
    return (store.get('aiSystemPrompt') as string) || ''
  })

  ipcMain.handle('ai:set-system-prompt', (_event, params: { prompt: string }) => {
    store.set('aiSystemPrompt', params.prompt)
  })

  // --- Agent chat with tool use ---

  const AGENT_TOOLS = [
    {
      type: 'function',
      function: {
        name: 'search_notes',
        description: '搜索知识库中的笔记',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_note',
        description: '读取指定笔记的完整内容',
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
        name: 'create_note',
        description: '创建新笔记',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题' },
            content: { type: 'string', description: 'Markdown 内容' }
          },
          required: ['title', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'edit_note',
        description: '编辑已有笔记',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题' },
            content: { type: 'string', description: '修改后的完整 Markdown 内容' }
          },
          required: ['title', 'content']
        }
      }
    }
  ]

  function findNoteByTitle(vaultPath: string, title: string): string | null {
    const db = getDatabase(vaultPath)
    const row = db.prepare('SELECT file_path FROM notes WHERE title = ?').get(title) as { file_path: string } | undefined
    if (row) return row.file_path

    // Fallback: scan directory for matching filename
    function scanDir(dir: string): string | null {
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const found = scanDir(fullPath)
            if (found) return found
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            const name = basename(entry.name, '.md')
            if (name === title) return fullPath
          }
        }
      } catch {}
      return null
    }
    return scanDir(vaultPath)
  }

  async function executeToolCall(
    name: string,
    args: Record<string, any>,
    vaultPath: string
  ): Promise<string> {
    switch (name) {
      case 'search_notes': {
        const results = await semanticSearch(vaultPath, args.query || '', 5)
        if (results.length === 0) return '未找到相关笔记。'
        return results.map((r, i) => `${i + 1}. **${r.title}**\n${r.chunk.slice(0, 200)}`).join('\n\n')
      }
      case 'read_note': {
        const filePath = findNoteByTitle(vaultPath, args.title || '')
        if (!filePath) return `未找到标题为「${args.title}」的笔记。`
        try {
          const content = readFileSync(filePath, 'utf-8')
          return content
        } catch {
          return `无法读取笔记「${args.title}」。`
        }
      }
      case 'create_note': {
        const safeName = (args.title || 'untitled').replace(/[\\/:*?"<>|]/g, '').trim()
        const filePath = join(vaultPath, `${safeName}.md`)
        if (existsSync(filePath)) return `笔记「${args.title}」已存在。`
        try {
          writeFileSync(filePath, args.content || '', 'utf-8')
          try { indexNote(vaultPath, filePath) } catch {}
          return `已创建笔记「${args.title}」。`
        } catch (e: any) {
          return `创建笔记失败: ${e.message}`
        }
      }
      case 'edit_note': {
        const filePath = findNoteByTitle(vaultPath, args.title || '')
        if (!filePath) return `未找到标题为「${args.title}」的笔记。`
        try {
          writeFileSync(filePath, args.content || '', 'utf-8')
          try { indexNote(vaultPath, filePath) } catch {}
          return `已更新笔记「${args.title}」。`
        } catch (e: any) {
          return `编辑笔记失败: ${e.message}`
        }
      }
      default:
        return `未知工具: ${name}`
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
    const prevController = activeAbortControllers.get(windowId)
    if (prevController) prevController.abort()

    const controller = new AbortController()
    activeAbortControllers.set(windowId, controller)

    const vaultPath = params.vaultPath || ''

    try {
      // Build initial messages with system prompt
      let messages = [...params.messages]
      const customPrompt = params.systemPrompt || (store.get('aiSystemPrompt') as string) || ''
      const defaultSystemPrompt = `你是一个智能知识库助手。你可以搜索、阅读、创建和编辑笔记来帮助用户。
使用工具来获取信息，然后基于获取的内容回答用户问题。
如果用户的问题可以通过搜索笔记来回答，请先搜索相关内容。`

      const systemContent = customPrompt || defaultSystemPrompt
      messages = [{ role: 'system', content: systemContent }, ...messages.filter((m) => m.role !== 'system')]

      // Context compaction
      messages = await compactMessages(messages)

      const MAX_TOOL_ITERATIONS = 5
      const MAX_CONTINUATIONS = 2
      let continuations = 0

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
              let args: Record<string, any> = {}
              try {
                args = JSON.parse(call.arguments)
              } catch {}

              window.webContents.send('ai:stream', {
                type: 'tool_call',
                content: JSON.stringify({ name: call.name, args })
              })

              const result = await executeToolCall(call.name, args, vaultPath)

              messages.push({
                role: 'tool',
                content: result,
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
            activeAbortControllers.delete(windowId)
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
    } catch (err: any) {
      if (!window.isDestroyed() && !controller.signal.aborted) {
        window.webContents.send('ai:stream', { type: 'error', content: err?.message || String(err) })
        window.webContents.send('ai:stream', { type: 'done', content: '' })
      }
    } finally {
      activeAbortControllers.delete(windowId)
    }
  })
}
