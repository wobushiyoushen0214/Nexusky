import { ipcMain, BrowserWindow } from 'electron'
import { aiManager, ChatMessage } from '../../services/ai'
import { analyzeWritingStyle, formatWritingStylePrompt } from '@shared/writing-style'
import { getErrorMessage as getErrorMessageShared } from '@shared/utils/errors'
import { startAiTask, finishAiTask } from '../../services/ai-task-control'
import { consumeStream } from '../streams/consume-stream'

function getErrorMessage(error: unknown): string {
  return getErrorMessageShared(error)
}

export function registerAiEditHandlers(): void {
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
      const { text: result, aborted, errorChunk } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: systemPrompt },
          userMessage
        ], controller.signal),
        {
          signal: controller.signal,
          window,
          onText: (delta) => window.webContents.send('ai:edit-stream', { type: 'text', content: delta })
        }
      )
      if (errorChunk !== null) return { success: false, error: errorChunk || 'AI 返回错误' }
      if (aborted) return { success: false, error: '已取消' }
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
}
