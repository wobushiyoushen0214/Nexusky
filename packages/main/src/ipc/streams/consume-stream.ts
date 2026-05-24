import type { BrowserWindow } from 'electron'
import type { ChatStreamEvent } from '../../services/ai/base-provider'

export type ConsumeStreamOptions = {
  signal?: AbortSignal
  window?: BrowserWindow
  onChunk?: (chunk: ChatStreamEvent) => void
  onText?: (delta: string) => void
  breakOnError?: boolean
}

export type ConsumeStreamResult = {
  text: string
  aborted: boolean
  errorChunk: string | null
}

export async function consumeStream(
  iter: AsyncIterable<ChatStreamEvent>,
  options: ConsumeStreamOptions = {}
): Promise<ConsumeStreamResult> {
  const { signal, window, onChunk, onText, breakOnError = true } = options
  let text = ''
  let errorChunk: string | null = null

  const isAborted = (): boolean =>
    Boolean(signal?.aborted || (window && window.isDestroyed()))

  for await (const chunk of iter) {
    if (isAborted()) break
    onChunk?.(chunk)
    if (chunk.type === 'text') {
      const delta = chunk.content
      text += delta
      onText?.(delta)
    } else if (chunk.type === 'error') {
      if (errorChunk === null) errorChunk = chunk.content
      if (breakOnError) break
    }
  }

  return { text, aborted: isAborted(), errorChunk }
}
