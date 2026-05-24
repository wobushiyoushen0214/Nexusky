import { describe, expect, it, vi } from 'vitest'
import { consumeStream } from '../packages/main/src/ipc/streams/consume-stream'
import type { ChatStreamEvent } from '../packages/main/src/services/ai/base-provider'

async function* gen(...chunks: ChatStreamEvent[]): AsyncGenerator<ChatStreamEvent> {
  for (const chunk of chunks) yield chunk
}

const text = (content: string): ChatStreamEvent => ({ type: 'text', content })
const error = (content: string): ChatStreamEvent => ({ type: 'error', content })
const done = (): ChatStreamEvent => ({ type: 'done', content: '' })

describe('consumeStream', () => {
  it('accumulates text chunks', async () => {
    const result = await consumeStream(gen(text('hello '), text('world'), done()))
    expect(result.text).toBe('hello world')
    expect(result.errorChunk).toBeNull()
    expect(result.aborted).toBe(false)
  })

  it('captures the first error chunk and breaks by default', async () => {
    const onText = vi.fn()
    const result = await consumeStream(gen(text('a'), error('boom'), text('b')), { onText })
    expect(result.text).toBe('a')
    expect(result.errorChunk).toBe('boom')
    expect(onText).toHaveBeenCalledTimes(1)
  })

  it('keeps draining when breakOnError is false', async () => {
    const onChunk = vi.fn()
    const result = await consumeStream(
      gen(text('a'), error('boom'), text('b'), done()),
      { breakOnError: false, onChunk }
    )
    expect(result.text).toBe('ab')
    expect(result.errorChunk).toBe('boom')
    expect(onChunk).toHaveBeenCalledTimes(4)
  })

  it('stops when the signal aborts before the iterator emits', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await consumeStream(gen(text('a'), text('b')), { signal: controller.signal })
    expect(result.text).toBe('')
    expect(result.aborted).toBe(true)
  })

  it('stops mid-stream when the signal aborts between chunks', async () => {
    const controller = new AbortController()
    async function* slow(): AsyncGenerator<ChatStreamEvent> {
      yield text('a')
      controller.abort()
      yield text('b')
    }
    const result = await consumeStream(slow(), { signal: controller.signal })
    expect(result.text).toBe('a')
    expect(result.aborted).toBe(true)
  })

  it('treats a destroyed window like an abort', async () => {
    const fakeWindow = { isDestroyed: vi.fn().mockReturnValue(true) } as unknown as Parameters<typeof consumeStream>[1]['window']
    const result = await consumeStream(gen(text('a')), { window: fakeWindow })
    expect(result.text).toBe('')
    expect(result.aborted).toBe(true)
  })

  it('invokes onChunk for every chunk and onText only for text chunks', async () => {
    const onChunk = vi.fn()
    const onText = vi.fn()
    await consumeStream(gen(text('hi'), done()), { onChunk, onText })
    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(onText).toHaveBeenCalledTimes(1)
    expect(onText).toHaveBeenCalledWith('hi')
  })
})
