import { ipcMain, BrowserWindow } from 'electron'
import { aiManager } from '../../services/ai'
import { analyzeWritingStyle, formatWritingStylePrompt } from '@shared/writing-style'

const completeAbortControllers: Map<string, AbortController> = new Map()

// Cache writing style analysis — document style doesn't change per-keystroke
const styleCache = new Map<string, string>()
// LRU completion cache — avoid repeated LLM calls for the same prefix
const completionCache = new Map<string, string>()
const MAX_COMPLETION_CACHE = 64

const getCompleteTaskKey = (windowId: number | undefined, taskKey?: string) => {
  return `${windowId ?? 'global'}:${taskKey || 'default'}`
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash | 0
  }
  return hash
}

function getCachedStylePrompt(styleSource: string): string {
  if (!styleSource || styleSource.length < 40) return ''
  const key = String(hashString(styleSource))
  const cached = styleCache.get(key)
  if (cached) return cached
  const profile = analyzeWritingStyle(styleSource)
  const prompt = formatWritingStylePrompt(profile)
  styleCache.set(key, prompt)
  // Keep cache bounded
  if (styleCache.size > 32) {
    const first = styleCache.keys().next().value
    if (first) styleCache.delete(first)
  }
  return prompt
}

export function registerAiCompleteHandlers(): void {
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

    // Check completion cache first
    const cacheKey = params.text.slice(-200)
    const cached = completionCache.get(cacheKey)
    if (cached !== undefined) return cached

    const window = BrowserWindow.fromWebContents(event.sender)
    const taskKey = getCompleteTaskKey(window?.id, params.taskKey)
    const previous = completeAbortControllers.get(taskKey)
    if (previous) previous.abort()
    const controller = new AbortController()
    completeAbortControllers.set(taskKey, controller)
    const signal = controller.signal

    try {
      const provider = aiManager.getProvider(config)
      const options = {
        temperature: params.temperature ?? 0.3,
        maxTokens: 60,
      }
      const stylePrompt = getCachedStylePrompt(params.styleSource || '')
      const system = [params.system || `Continue the text in 1-2 short sentences. Be concise.`, stylePrompt].filter(Boolean).join('\n\n')
      const iter = provider.chatStream([
        { role: 'system', content: system },
        { role: 'user', content: params.text }
      ], signal, options)

      // Collect stream but return early once we have enough text for a ghost completion
      let result = ''
      for await (const chunk of iter) {
        if (signal?.aborted) break
        if (chunk.type === 'text') {
          result += chunk.content
          // First ~60 chars is enough for inline ghost completion
          if (result.length >= 60) break
        } else if (chunk.type === 'error') {
          break
        }
      }
      if (signal?.aborted) return ''
      const final = result.trim().slice(0, 200)

      // Populate cache
      if (final) {
        completionCache.set(cacheKey, final)
        if (completionCache.size > MAX_COMPLETION_CACHE) {
          const first = completionCache.keys().next().value
          if (first) completionCache.delete(first)
        }
      }

      return final
    } catch {
      return ''
    } finally {
      if (completeAbortControllers.get(taskKey) === controller) {
        completeAbortControllers.delete(taskKey)
      }
    }
  })
}
