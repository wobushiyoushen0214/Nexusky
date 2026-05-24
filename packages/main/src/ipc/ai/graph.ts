import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { aiManager } from '../../services/ai'
import { getErrorMessage as getErrorMessageShared } from '@shared/utils/errors'
import { startAiTask, finishAiTask } from '../../services/ai-task-control'
import { consumeStream } from '../streams/consume-stream'

function getErrorMessage(error: unknown): string {
  return getErrorMessageShared(error)
}

export function registerAiGraphHandlers(): void {
  ipcMain.handle('ai:generate-graph', async (event, params: { filePaths: string[]; vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { success: false, error: '窗口不存在' }

    const config = aiManager.getActiveConfig()
    if (!config) return { success: false, error: '未配置 AI 提供商' }
    const configError = aiManager.validateConfig(config)
    if (configError) return { success: false, error: configError }

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
    const windowId = window.id
    const controller = startAiTask(windowId)

    try {
      const { text: result, aborted, errorChunk } = await consumeStream(
        provider.chatStream([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Below are ${fileNames.length} notes. Analyze their relationships and generate a knowledge graph:\n\n${filesContent}` }
        ], controller.signal),
        {
          signal: controller.signal,
          window,
          onText: (delta) => window.webContents.send('ai:graph-progress', { content: delta })
        }
      )
      if (errorChunk !== null) return { success: false, error: errorChunk || 'AI 返回错误' }
      if (aborted) return { success: false, error: '已取消' }
      window.webContents.send('ai:graph-done', {})
      return { success: true, content: result.trim() }
    } catch (err: unknown) {
      if (controller.signal.aborted) return { success: false, error: '已取消' }
      return { success: false, error: getErrorMessage(err) }
    } finally {
      finishAiTask(windowId, controller)
    }
  })
}
