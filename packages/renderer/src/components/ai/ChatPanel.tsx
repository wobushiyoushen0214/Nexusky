import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../../stores/vault-store'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; filePath: string; chunk: string; score: number }[]
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [pendingSources, setPendingSources] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cleanup = window.api.onAiStream((event) => {
      if (event.type === 'text') {
        setStreamContent((prev) => prev + event.content)
      } else if (event.type === 'done') {
        setStreamContent((prev) => {
          if (prev) {
            setMessages((msgs) => [...msgs, {
              id: Date.now().toString(),
              role: 'assistant',
              content: prev,
              sources: pendingSources.length > 0 ? [...pendingSources] : undefined
            }])
            setPendingSources([])
          }
          return ''
        })
        setIsStreaming(false)
      } else if (event.type === 'error') {
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: `错误: ${event.content}` }])
        setStreamContent('')
        setIsStreaming(false)
      }
    })
    return cleanup
  }, [pendingSources])

  useEffect(() => {
    const cleanup = window.api.onAiSources((sources) => {
      setPendingSources(sources)
    })
    return cleanup
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamContent])

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamContent('')

    const chatMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
    await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined } as any)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-12">
            <p className="text-[13px] text-[var(--text-tertiary)]">向 AI 提问关于你的笔记</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%] space-y-2">
              <div className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-[var(--text-tertiary)] px-1">来源引用：</p>
                  {msg.sources.map((s, i) => (
                    <div key={i} className="px-2 py-1 rounded bg-[var(--bg-hover)] text-[11px] text-[var(--text-secondary)]">
                      <span className="text-[var(--accent-text)]">[^{i + 1}]</span> {s.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isStreaming && streamContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed bg-[var(--bg-elevated)] text-[var(--text-primary)]">
              <p className="whitespace-pre-wrap">{streamContent}</p>
            </div>
          </div>
        )}
        {isStreaming && !streamContent && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 bg-[var(--bg-elevated)]">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] animate-pulse [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border-subtle)]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="输入消息..."
            disabled={isStreaming}
            className="flex-1 h-8 px-3 text-[13px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="h-8 px-3 bg-[var(--accent)] text-white text-[12px] font-medium rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
