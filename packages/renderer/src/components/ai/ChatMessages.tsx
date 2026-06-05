import { memo, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { renderMarkdown } from './MessageBubble'
import { buildChatHints, queueAiCommandDraft } from './ai-command-draft'
import type { Message } from './MessageBubble'

interface ChatMessagesProps {
  messages: Message[]
  isStreaming: boolean
  streamContent: string
  editMode: boolean
  editElapsed: number
  editStreamContent: string
  toolStatus: string | null
  onRegenerate: (msg: Message) => void
  onContinue?: (msg: Message) => void
}

export const ChatMessages = memo(function ChatMessages({ messages, isStreaming, streamContent, editMode, editElapsed, editStreamContent, toolStatus, onRegenerate, onContinue }: ChatMessagesProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const chatHints = useMemo(() => buildChatHints(t), [t])

  useEffect(() => {
    if (!scrollRef.current) return
    if (isStreaming) {
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
        })
      }
    } else {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, streamContent, isStreaming])

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  return (
    <div ref={scrollRef} className="file-tree-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 10px' }}>
      {messages.length === 0 && !isStreaming && (
        <div style={{ padding: '32px 16px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>{editMode ? t('chatMessages.emptyTitleEdit') : t('chatMessages.emptyTitleChat')}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>{t('chatMessages.emptyHint')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chatHints.map((hint) => (
              <button
                key={hint.id}
                onClick={() => {
                  if (hint.draft) {
                    queueAiCommandDraft(hint.draft, () => {})
                  } else {
                    window.dispatchEvent(new CustomEvent('chat-hint-click', { detail: hint.event }))
                  }
                }}
                style={{
                  width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 12, color: 'var(--text-secondary)', background: 'color-mix(in srgb, var(--control-bg) 62%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--border-subtle) 54%, transparent)', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                  boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 58%, transparent)',
                  transition: 'border-color 100ms, background 100ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 34%, var(--border-subtle))'; e.currentTarget.style.background = 'color-mix(in srgb, var(--control-hover) 72%, transparent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border-subtle) 54%, transparent)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--control-bg) 62%, transparent)' }}
              >
                <span style={{ width: 24, height: 20, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent-text)', background: 'var(--accent-muted)', flexShrink: 0 }}>{hint.mark}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--text-secondary)', fontWeight: 500 }}>{hint.title}</span>
                  <span style={{ display: 'block', color: 'var(--text-tertiary)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === 'assistant' && !isStreaming && i === messages.length - 1
          const nextMsg = messages[i + 1]
          const isPartialBeforeError = msg.role === 'assistant' && nextMsg?.role === 'assistant' && nextMsg.content.startsWith('⚠️') && !isStreaming
          return (
            <MessageBubbleWithRegenerate key={msg.id} msg={msg} onRegenerate={isLastAssistant ? onRegenerate : undefined} onContinue={isPartialBeforeError ? onContinue : undefined} />
          )
        })}
        {isStreaming && streamContent && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
            <div style={{ maxWidth: '90%', minWidth: 0, borderRadius: '14px 14px 14px 5px', padding: '10px 14px', fontSize: 13, lineHeight: 1.7, background: 'color-mix(in srgb, var(--panel-bg-soft) 68%, transparent)', border: '1px solid color-mix(in srgb, var(--border-subtle) 48%, transparent)', color: 'var(--text-primary)', wordBreak: 'break-word', overflowWrap: 'anywhere', overflow: 'hidden', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 52%, transparent)' }}>
              <div className="editor-content chat-md" style={{ fontSize: 13, lineHeight: 1.7, maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(streamContent) }} />
              {toolStatus && (
                <div style={{ marginTop: 8, paddingTop: 6, boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--border-subtle) 34%, transparent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite', opacity: 0.7 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{toolStatus}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {isStreaming && !streamContent && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ borderRadius: '14px 14px 14px 5px', padding: '12px 16px', background: 'color-mix(in srgb, var(--panel-bg-soft) 68%, transparent)', border: '1px solid color-mix(in srgb, var(--border-subtle) 48%, transparent)', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 52%, transparent)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
              {editStreamContent && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxHeight: 60, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.4, opacity: 0.7 }}>
                  {editStreamContent.slice(-200)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

import { MessageBubble } from './MessageBubble'

const MessageBubbleWithRegenerate = memo(function MessageBubbleWithRegenerate({ msg, onRegenerate, onContinue }: { msg: Message; onRegenerate?: (msg: Message) => void; onContinue?: (msg: Message) => void }) {
  return <MessageBubble msg={msg} onRegenerate={onRegenerate} onContinue={onContinue} />
})
