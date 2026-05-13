import { memo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

const PURIFY_CONFIG = {
  FORBID_TAGS: ['form', 'iframe', 'object', 'embed', 'script', 'style', 'link', 'meta'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
}

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; filePath: string; chunk: string; score: number }[]
}

interface MessageBubbleProps {
  msg: Message
  onRegenerate?: (msg: Message) => void
}

export const MessageBubble = memo(function MessageBubble({ msg, onRegenerate }: MessageBubbleProps) {
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
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
          ) : (
            <div className="editor-content chat-md" style={{ fontSize: 13, lineHeight: 1.7, maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
          )}
        </div>
        {msg.role === 'assistant' && onRegenerate && (
          <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
            <button
              onClick={() => onRegenerate(msg)}
              style={{
                height: 20, padding: '0 8px', fontSize: 10, color: 'var(--text-tertiary)',
                background: 'transparent', border: '1px solid var(--border-subtle)',
                borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                transition: 'color 100ms, border-color 100ms',
              }}
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
          </div>
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
