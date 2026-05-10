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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>向 AI 提问关于你的笔记</p>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '85%' }}>
                <div style={{
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  boxShadow: msg.role === 'user' ? 'var(--shadow-sm), 0 0 12px var(--accent-glow)' : 'var(--shadow-sm), inset 0 1px 0 var(--border-shine)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                }}>
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '0 4px' }}>来源引用：</p>
                    {msg.sources.map((s, i) => (
                      <div key={i} style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--bg-hover)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--accent-text)' }}>[{i + 1}]</span> {s.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isStreaming && streamContent && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ maxWidth: '85%', borderRadius: 10, padding: '8px 12px', fontSize: 13, lineHeight: 1.6, background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{streamContent}</p>
              </div>
            </div>
          )}
          {isStreaming && !streamContent && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ borderRadius: 10, padding: '10px 14px', background: 'var(--bg-elevated)', display: 'flex', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)', animation: 'pulse 1.2s infinite' }} />
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)', animation: 'pulse 1.2s infinite 0.15s' }} />
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)', animation: 'pulse 1.2s infinite 0.3s' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-glow)', background: 'var(--bg-glass)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)', boxShadow: 'inset 0 1px 0 var(--border-shine)' } as React.CSSProperties}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="输入消息..."
            disabled={isStreaming}
            style={{
              flex: 1,
              height: 36,
              padding: '0 14px',
              fontSize: 13,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              color: 'var(--text-primary)',
              outline: 'none',
              opacity: isStreaming ? 0.5 : 1,
              transition: 'border-color 150ms',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            style={{
              height: 36,
              padding: '0 16px',
              fontSize: 12,
              fontWeight: 500,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
              opacity: isStreaming || !input.trim() ? 0.4 : 1,
              transition: 'opacity 150ms',
            }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
