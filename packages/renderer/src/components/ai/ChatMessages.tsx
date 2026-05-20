import { memo, useRef, useEffect } from 'react'
import { renderMarkdown } from './MessageBubble'
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

interface AICommandDraft {
  prompt: string
  mode?: 'chat' | 'edit'
  agentMode?: boolean
  attachSelection?: boolean
  unboundEdit?: boolean
  requiresCurrentNote?: boolean
}

interface ChatHint {
  title: string
  detail: string
  mark: string
  draft?: AICommandDraft
  eventText?: string
}

const CHAT_HINTS: ChatHint[] = [
  {
    title: '基于知识库回答',
    detail: '自动搜索相关笔记并带来源引用',
    mark: 'AI',
    draft: { mode: 'chat', agentMode: true, prompt: '请基于当前知识库回答：' }
  },
  {
    title: '优化当前笔记',
    detail: '生成结构和表达修改方案，确认后应用',
    mark: 'ED',
    draft: { mode: 'edit', requiresCurrentNote: true, prompt: '请优化当前笔记的结构、标题层级和表达清晰度，保留原有事实。' }
  },
  {
    title: '改写选中文本',
    detail: '先在编辑器选中文本，再让 AI 精修',
    mark: 'SE',
    draft: { mode: 'edit', attachSelection: true, prompt: '请改写选中文本，使表达更清晰、更适合知识库长期保存。' }
  },
  {
    title: '批量生成关联笔记',
    detail: '用双向链接搭建一个主题知识库骨架',
    mark: 'KB',
    draft: { mode: 'edit', unboundEdit: true, prompt: '请围绕一个主题生成 5 篇相互关联的 Markdown 笔记，每篇都有清晰标题、摘要、要点和 [[双向链接]]。主题是：' }
  },
  {
    title: '生成知识图谱',
    detail: '分析当前笔记并生成关系图',
    mark: 'KG',
    eventText: '生成知识图谱'
  },
  {
    title: '@ 引用笔记',
    detail: '把指定笔记作为本轮上下文',
    mark: '@',
    eventText: '@ 引用笔记作为上下文'
  }
]

export const ChatMessages = memo(function ChatMessages({ messages, isStreaming, streamContent, editMode, editElapsed, editStreamContent, toolStatus, onRegenerate, onContinue }: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

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
    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
      {messages.length === 0 && !isStreaming && (
        <div style={{ padding: '32px 16px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>{editMode ? '选择一个编辑任务' : '选择一个 AI 任务'}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>也可以直接输入问题，或用 @ 引用笔记。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CHAT_HINTS.map((hint) => (
              <button
                key={hint.title}
                onClick={() => {
                  if (hint.draft) {
                    window.dispatchEvent(new CustomEvent('ai-command-draft', { detail: hint.draft }))
                  } else {
                    window.dispatchEvent(new CustomEvent('chat-hint-click', { detail: hint.eventText }))
                  }
                }}
                style={{
                  width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 100ms, background 100ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            <div style={{ borderRadius: '14px 14px 14px 4px', padding: '12px 16px', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
