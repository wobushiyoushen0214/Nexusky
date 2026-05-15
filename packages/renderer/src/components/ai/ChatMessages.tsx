import { memo, useRef, useEffect } from 'react'
import { renderMarkdown } from './MessageBubble'
import type { Message } from './MessageBubble'

interface ChatMessagesProps {
  messages: Message[]
  isStreaming: boolean
  streamContent: string
  editMode: boolean
  editElapsed: number
  toolStatus: string | null
  onRegenerate: (msg: Message) => void
}

export const ChatMessages = memo(function ChatMessages({ messages, isStreaming, streamContent, editMode, editElapsed, toolStatus, onRegenerate }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: isStreaming ? 'auto' : 'smooth' })
  }, [messages, streamContent])

  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
      {messages.length === 0 && !isStreaming && (
        <div style={{ padding: '32px 16px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, fontWeight: 500 }}>可以帮你做什么？</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { text: '总结当前笔记的要点', icon: '📝' },
              { text: '基于笔记内容提问', icon: '💡' },
              { text: '生成知识图谱', icon: '🔗' },
              { text: '切换编辑模式修改文档', icon: '✎' },
              { text: '@ 引用笔记作为上下文', icon: '@' },
            ].map((hint) => (
              <button
                key={hint.text}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('chat-hint-click', { detail: hint.text }))
                }}
                style={{
                  width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 100ms, background 100ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
              >
                <span style={{ width: 20, textAlign: 'center', fontSize: 13, flexShrink: 0 }}>{hint.icon}</span>
                <span>{hint.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === 'assistant' && !isStreaming && i === messages.length - 1
          return (
            <MessageBubbleWithRegenerate key={msg.id} msg={msg} onRegenerate={isLastAssistant ? onRegenerate : undefined} />
          )
        })}
        {isStreaming && streamContent && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
            <div style={{ maxWidth: '88%', minWidth: 0, borderRadius: '14px 14px 14px 4px', padding: '10px 14px', fontSize: 13, lineHeight: 1.7, background: 'var(--bg-elevated)', color: 'var(--text-primary)', wordBreak: 'break-word', overflowWrap: 'anywhere', overflow: 'hidden' }}>
              <div className="editor-content chat-md" style={{ fontSize: 13, lineHeight: 1.7, maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(streamContent) }} />
              {toolStatus && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite', opacity: 0.7 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{toolStatus}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {isStreaming && !streamContent && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ borderRadius: '14px 14px 14px 4px', padding: '12px 16px', background: 'var(--bg-elevated)', display: 'flex', gap: 8, alignItems: 'center' }}>
              {toolStatus ? (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite', opacity: 0.7 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{toolStatus}</span>
                </>
              ) : (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite', opacity: 0.7 }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite 0.2s', opacity: 0.7 }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite 0.4s', opacity: 0.7 }} />
                </>
              )}
              {editElapsed > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>{editElapsed}s</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

import { MessageBubble } from './MessageBubble'

const MessageBubbleWithRegenerate = memo(function MessageBubbleWithRegenerate({ msg, onRegenerate }: { msg: Message; onRegenerate?: (msg: Message) => void }) {
  return <MessageBubble msg={msg} onRegenerate={onRegenerate} />
})
