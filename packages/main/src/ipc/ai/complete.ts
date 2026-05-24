import { ipcMain, BrowserWindow } from 'electron'
import { aiManager } from '../../services/ai'
import { analyzeWritingStyle, formatWritingStylePrompt } from '@shared/writing-style'
import { consumeStream } from '../streams/consume-stream'

const completeAbortControllers: Map<string, AbortController> = new Map()

const getCompleteTaskKey = (windowId: number | undefined, taskKey?: string) => {
  return `${windowId ?? 'global'}:${taskKey || 'default'}`
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
}
