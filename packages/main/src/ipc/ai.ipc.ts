import { ipcMain, BrowserWindow } from 'electron'
import { aiManager, AIProviderConfig, ChatMessage } from '../services/ai'
import { store } from '../services/store'
import { semanticSearch } from '../services/embedding'
import { listOllamaModels } from '../services/ai/ollama-provider'

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

    let messages = [...params.messages]

    if (params.vaultPath) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      if (lastUserMsg) {
        const results = await semanticSearch(params.vaultPath, lastUserMsg.content, 5)
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

    for await (const chunk of aiManager.chat(messages)) {
      if (window.isDestroyed()) break
      window.webContents.send('ai:stream', chunk)
    }
  })

  ipcMain.handle('ai:complete', async (_event, params: { text: string }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return ''

    try {
      const OpenAI = require('openai').default
      const client = new OpenAI({
        apiKey: config.apiKey || 'ollama',
        baseURL: config.baseUrl || (config.type === 'ollama' ? 'http://localhost:11434/v1' : undefined)
      })
      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: '续写1-2句，只输出续写内容。' },
          { role: 'user', content: params.text }
        ],
        max_tokens: 60,
        temperature: 0.7,
        stream: false
      })
      return response.choices[0]?.message?.content?.trim() || ''
    } catch {
      return ''
    }
  })

  ipcMain.handle('ai:list-ollama-models', async (_event, params: { baseUrl?: string }) => {
    return listOllamaModels(params.baseUrl)
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

    let textContent = `文件: ${params.filePath}\n\n当前内容:\n${params.fileContent}\n\n`
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
}
