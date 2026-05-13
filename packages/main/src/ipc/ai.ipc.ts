import { ipcMain, BrowserWindow } from 'electron'
import { aiManager, AIProviderConfig, ChatMessage } from '../services/ai'
import { store } from '../services/store'
import { semanticSearch } from '../services/embedding'
import { listOllamaModels } from '../services/ai/ollama-provider'
import { indexNote, resolveAllLinks } from '../services/indexer'
import { getDatabase } from '../services/database'

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
  })

  ipcMain.handle('ai:validate', async (_event, params: { config: AIProviderConfig }) => {
    const provider = aiManager.getProvider(params.config)
    return provider.validate()
  })

  ipcMain.handle('ai:chat', async (event, params: { messages: ChatMessage[]; vaultPath?: string }) => {
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
          const systemMsg: ChatMessage = {
            role: 'system',
            content: `你是一个知识库助手。基于用户的笔记内容回答问题。

规则：
1. 优先基于提供的笔记内容回答
2. 引用来源时使用 [^n] 格式标注
3. 如果笔记中没有相关信息，可以基于自身知识回答，但要说明

以下是相关笔记内容：
---
${context}
---`
          }
          messages = [systemMsg, ...messages.filter((m) => m.role !== 'system')]

          window.webContents.send('ai:sources', results.map((r) => ({
            title: r.title,
            filePath: r.filePath,
            chunk: r.chunk.slice(0, 100),
            score: r.score
          })))
        }
      }
    }

    try {
      for await (const chunk of aiManager.chat(messages, controller.signal)) {
        if (window.isDestroyed() || controller.signal.aborted) break
        window.webContents.send('ai:stream', chunk)
      }
    } catch (err: any) {
      if (!window.isDestroyed()) {
        window.webContents.send('ai:stream', { type: 'error', content: err?.message || String(err) })
      }
    } finally {
      if (!window.isDestroyed()) {
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

  ipcMain.handle('ai:complete', async (_event, params: { text: string; system?: string }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return ''

    try {
      const provider = aiManager.getProvider(config)
      let result = ''
      for await (const chunk of provider.chatStream([
        { role: 'system', content: params.system || '续写1-2句，只输出续写内容。' },
        { role: 'user', content: params.text }
      ])) {
        if (chunk.type === 'text') result += chunk.content
        if (chunk.type === 'error') return ''
      }
      return params.system ? result.trim() : result.trim().slice(0, 200)
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

    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false, error: '窗口不存在' }

    const systemPrompt = `你是一个笔记编辑助手。用户会给你一个 Markdown 笔记的内容和修改指令。
请直接输出修改后的完整笔记内容，不要添加任何解释、代码块标记或前后缀。
只输出修改后的 Markdown 内容本身。`

    let fileContent = params.fileContent
    const TOKEN_LIMIT = 12000
    const estimatedTokens = Math.ceil(fileContent.length / 4)

    if (estimatedTokens > TOKEN_LIMIT) {
      const sections = fileContent.split(/(?=^#{1,3}\s)/m)
      const instruction = params.instruction.toLowerCase()
      const scored = sections.map((s, i) => ({
        section: s,
        index: i,
        score: instruction.split(/\s+/).filter((w) => w.length > 1 && s.toLowerCase().includes(w)).length
      }))
      scored.sort((a, b) => b.score - a.score)
      let selected: typeof scored = []
      let totalLen = 0
      for (const s of scored) {
        if (totalLen + s.section.length > TOKEN_LIMIT * 4) break
        selected.push(s)
        totalLen += s.section.length
      }
      if (selected.length < sections.length) {
        selected.sort((a, b) => a.index - b.index)
        fileContent = selected.map((s) => s.section).join('')
        fileContent = `[注意: 以下为文件的相关片段，非完整内容。请基于这些片段输出修改后的完整内容]\n\n${fileContent}`
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
        }
        if (chunk.type === 'error') return { success: false, error: chunk.content }
      }
      return { success: true, content: result.trim() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('ai:generate-graph', async (event, params: { filePaths: string[]; vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false, error: '窗口不存在' }

    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, error: '未配置 AI 提供商' }

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

    const systemPrompt = `你是一个知识图谱生成器。分析给定笔记的标题和内容，输出它们之间关系的 Mermaid 图。

严格要求：
1. 只输出 mermaid graph TD 代码，不要任何其他文字、解释或代码块标记
2. 节点 ID 用英文字母数字（如 A, B, C），节点标签用中括号包裹笔记标题
3. 边用 -->|关系| 格式标注关系类型
4. 不要输出 \`\`\`mermaid 或 \`\`\` 标记

输出示例：
graph TD
    A[React Hooks] -->|基础| B[useState]
    A -->|进阶| C[自定义Hook]
    B -->|相关| C
5. 只输出 mermaid 代码，不要其他解释文字
6. 不要用 \`\`\` 代码块包裹，直接输出 mermaid 语法`

    const provider = aiManager.getProvider(config)
    let result = ''

    try {
      for await (const chunk of provider.chatStream([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `以下是 ${fileNames.length} 篇笔记的内容，请分析它们之间的关系并生成知识图谱：\n\n${filesContent}` }
      ])) {
        if (window.isDestroyed()) break
        if (chunk.type === 'text') {
          result += chunk.content
          window.webContents.send('ai:graph-progress', { content: chunk.content })
        }
        if (chunk.type === 'error') return { success: false, error: chunk.content }
      }
      window.webContents.send('ai:graph-done', {})
      return { success: true, content: result.trim() }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('ai:generate-notes', async (event, params: { instruction: string; vaultPath: string; targetDir?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false, error: '窗口不存在', files: [] }

    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, error: '未配置 AI 提供商', files: [] }

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
          console.error('[indexNote] failed for', fp, e)
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
              const insertLink = db.prepare('INSERT INTO links (source_note_id, target_title, context) VALUES (?, ?, ?)')
              const findNote = db.prepare('SELECT id FROM notes WHERE title = ?')

              for (const rel of relations) {
                const sourceNote = findNote.get(rel.source) as { id: string } | undefined
                if (sourceNote && rel.target && rel.source !== rel.target) {
                  const existing = db.prepare('SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ?').get(sourceNote.id, rel.target)
                  if (!existing) {
                    insertLink.run(sourceNote.id, rel.target, rel.reason || '')
                  }
                }
              }
              try { resolveAllLinks(params.vaultPath) } catch {}
            }
          }
        } catch (e) {
          console.error('[semantic-links] failed', e)
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
        if (chunk.type === 'error') return { success: false, error: chunk.content }
      }

      if (!relResult.trim()) return { success: false, error: 'AI 未返回结果' }

      const jsonStr = relResult.replace(/```json?\s*|\s*```/g, '').trim()
      const relations = JSON.parse(jsonStr) as { source: string; target: string; reason: string }[]
      if (!Array.isArray(relations)) return { success: false, error: '解析失败' }

      const insertLink = db.prepare('INSERT INTO links (source_note_id, target_title, context) VALUES (?, ?, ?)')
      const findNote = db.prepare('SELECT id FROM notes WHERE title = ?')
      let added = 0

      for (const rel of relations) {
        const sourceNote = findNote.get(rel.source) as { id: string } | undefined
        if (sourceNote && rel.target && rel.source !== rel.target) {
          const existing = db.prepare('SELECT 1 FROM links WHERE source_note_id = ? AND target_title = ?').get(sourceNote.id, rel.target)
          if (!existing) {
            insertLink.run(sourceNote.id, rel.target, rel.reason || '')
            added++
          }
        }
      }
      try { resolveAllLinks(params.vaultPath) } catch {}

      return { success: true, added }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
