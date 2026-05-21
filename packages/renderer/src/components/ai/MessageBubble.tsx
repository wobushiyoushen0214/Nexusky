import { memo, useState } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { renderMarkdownCallouts } from '@shared/markdown/callouts'
import { renderMarkdownFootnotes } from '@shared/markdown/footnotes'
import { renderMarkdownHighlights } from '@shared/markdown/highlights'
import { stripMarkdownComments } from '@shared/markdown/comments'
import type { ChatSource } from '@shared/types/ipc'
import { isBatchPlanContent, parseBatchPlanLine } from './batch-progress'

marked.setOptions({ breaks: true, gfm: true })

const PURIFY_CONFIG = {
  FORBID_TAGS: ['form', 'iframe', 'object', 'embed', 'script', 'style', 'link', 'meta'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
}

export function renderMarkdown(md: string): string {
  const html = marked.parse(renderMarkdownHighlights(renderMarkdownCallouts(renderMarkdownFootnotes(stripMarkdownComments(md)))), { async: false }) as string
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  attachments?: { type: 'note' | 'selection' | 'image' | 'document'; label: string }[]
}

interface MessageBubbleProps {
  msg: Message
  onRegenerate?: (msg: Message) => void
  onContinue?: (msg: Message) => void
}

export const MessageBubble = memo(function MessageBubble({ msg, onRegenerate, onContinue }: MessageBubbleProps) {
  const isPlanList = msg.role === 'assistant' && isBatchPlanContent(msg.content)

  return (
    <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', minWidth: 0 }}>
      <div style={{ maxWidth: '88%', minWidth: 0 }}>
        <div style={{
          borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          padding: '10px 14px', fontSize: 13, lineHeight: 1.7,
          background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
          color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
          wordBreak: 'break-word', overflowWrap: 'anywhere',
          overflow: 'hidden',
        }}>
          {msg.role === 'user' ? (
            <>
              {msg.attachments && msg.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {msg.attachments.map((att, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      {att.type === 'note' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
                      {att.type === 'selection' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>}
                      {att.type === 'image' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
                      {att.type === 'document' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>}
                      {att.label}
                    </span>
                  ))}
                </div>
              )}
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
            </>
          ) : isPlanList ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {msg.content.split('\n').filter(Boolean).map((line, i) => {
                const { state, title } = parseBatchPlanLine(line)
                const done = state === 'done'
                const stopped = state === 'stopped'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                    {done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : stopped ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'spin 2s linear infinite' }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    )}
                    <span style={{ fontSize: 12, color: done ? 'var(--text-primary)' : stopped ? 'var(--text-tertiary)' : 'var(--text-secondary)', opacity: done ? 1 : 0.8 }}>{title}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="editor-content chat-md" style={{ fontSize: 13, lineHeight: 1.7, maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
          )}
        </div>
        {msg.role === 'assistant' && (
          <MessageActionBar content={msg.content} onRegenerate={onRegenerate ? () => onRegenerate(msg) : undefined} onContinue={onContinue ? () => onContinue(msg) : undefined} />
        )}
        {msg.sources && msg.sources.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {msg.sources.map((s, i) => (
              <div key={i} style={{ padding: '3px 8px', borderRadius: 4, background: 'var(--accent-muted)', fontSize: 10, color: 'var(--accent-text)' }}>
                [{i + 1}] {s.title}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

const actionBtnStyle: React.CSSProperties = {
  height: 20, padding: '0 8px', fontSize: 10, color: 'var(--text-tertiary)',
  background: 'transparent', border: '1px solid var(--border-subtle)',
  borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
  transition: 'color 100ms, border-color 100ms',
}

function MessageActionBar({ content, onRegenerate, onContinue }: { content: string; onRegenerate?: () => void; onContinue?: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
      <button
        onClick={handleCopy}
        style={actionBtnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
        title="复制"
      >
        {copied ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        {copied ? '已复制' : '复制'}
      </button>
      {onContinue && (
        <button
          onClick={onContinue}
          style={actionBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
          title="继续生成"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          继续生成
        </button>
      )}
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          style={actionBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
          title="重新生成"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          重新生成
        </button>
      )}
    </div>
  )
}
