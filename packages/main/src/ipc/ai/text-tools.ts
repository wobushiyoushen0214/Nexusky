import { ipcMain } from 'electron'
import { aiManager } from '../../services/ai'
import { formatFlashcardsMarkdown, normalizeGeneratedFlashcards } from '../../services/ai/flashcards'
import { getErrorMessage as getErrorMessageShared } from '@shared/utils/errors'
import { consumeStream } from '../streams/consume-stream'

function getErrorMessage(error: unknown): string {
  return getErrorMessageShared(error)
}

export function registerAiTextToolHandlers(): void {
  ipcMain.handle('ai:summarize', async (_event, params: { content: string }) => {
    const config = aiManager.getActiveConfig()
    if (!config) return ''
    if (aiManager.validateConfig(config)) return ''
    try {
      const provider = aiManager.getProvider(config)
      const { text: result, errorChunk } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: '为以下笔记生成一段简洁的摘要（2-3句话）。只输出摘要内容，不要前缀。' },
          { role: 'user', content: params.content.slice(0, 3000) }
        ])
      )
      if (errorChunk !== null) return ''
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
      const { text: result, errorChunk } = await consumeStream(
        provider.chatStream([
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
        ], undefined, { temperature: 0.2 })
      )
      if (errorChunk !== null) return { success: false, cards: [], error: errorChunk || 'AI 生成闪卡失败' }

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
      const { text: result, errorChunk } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: `你是一个标签建议助手。根据笔记内容建议 2-4 个标签。只输出标签，用逗号分隔，不要 # 前缀，不要解释。已有标签: ${params.existingTags.join(', ')}` },
          { role: 'user', content: params.content.slice(0, 2000) }
        ])
      )
      if (errorChunk !== null) return []
      return result.trim().split(/[,，、\n]/).map((t) => t.trim()).filter((t) => t && t.length < 20)
    } catch {
      return []
    }
  })
}
