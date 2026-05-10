import { ipcMain, BrowserWindow } from 'electron'
import { aiManager, AIProviderConfig, ChatMessage } from '../services/ai'
import { store } from '../services/store'
import { semanticSearch } from '../services/embedding'

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
      const provider = aiManager.getProvider(config)
      let result = ''
      for await (const chunk of provider.chatStream([
        { role: 'system', content: '你是一个写作助手。根据上文续写一小段内容（1-2句话）。只输出续写内容，不要解释。' },
        { role: 'user', content: params.text }
      ])) {
        if (chunk.type === 'text') result += chunk.content
        if (chunk.type === 'error') return ''
      }
      return result.trim()
    } catch {
      return ''
    }
  })
}
