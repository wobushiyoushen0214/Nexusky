import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import { ConfirmModal } from '../ConfirmModal'
import { safeGetJSON, safeSetJSON, safeRemove } from '../../utils/storage'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; filePath: string; chunk: string; score: number }[]
}

const STORAGE_KEY = 'nexusky-chat-history'

function friendlyError(raw: string): string {
  if (!raw) return '请求失败，请稍后重试'
  // 屏蔽完整本地路径
  let msg = raw.replace(/\/[^\s]+\/(node_modules|app\.asar[^\s]*)/g, '<...>')
  // 模式匹配常见错误
  if (/dlopen|incompatible architecture/i.test(msg)) {
    return '应用架构不匹配，请下载与你的 Mac 处理器对应的版本（Apple Silicon 或 Intel）。'
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|getaddrinfo/i.test(msg)) {
    return '无法连接到 AI 服务，请检查网络或 API Base URL 配置。'
  }
  if (/401|unauthorized|invalid api key/i.test(msg)) {
    return 'API Key 无效或已过期，请在设置中检查。'
  }
  if (/429|rate limit/i.test(msg)) {
    return '请求过于频繁，已被限流。请稍后重试。'
  }
  if (/timeout|timed out/i.test(msg)) {
    return '请求超时，AI 服务响应过慢。'
  }
  // 截断过长的原始错误
  if (msg.length > 200) msg = msg.slice(0, 200) + '...'
  return msg
}

function loadHistory(): Message[] {
  return safeGetJSON<Message[]>(STORAGE_KEY, [])
}

function saveHistory(messages: Message[]): void {
  // 只保留最近 100 条，避免 localStorage 配额超限
  // 多模态图片的 base64 会非常大，进一步剔除超大消息
  let trimmed = messages.slice(-100)
  let ok = safeSetJSON(STORAGE_KEY, trimmed)
  if (ok) return
  // 写入失败（quota exceeded）：再降级保留最近 30 条
  trimmed = messages.slice(-30)
  ok = safeSetJSON(STORAGE_KEY, trimmed)
  if (!ok) {
    // 还失败：清空历史避免后续累积
    safeRemove(STORAGE_KEY)
    toast('对话历史过大，已清理旧记录', 'info')
  }
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>(loadHistory)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const pendingSourcesRef = useRef<any[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<{ title: string; filePath: string }[]>([])
  const [attachedNotes, setAttachedNotes] = useState<{ title: string; filePath: string }[]>([])
  const [editMode, setEditMode] = useState(false)
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editResult, setEditResult] = useState<{ content: string; filePath: string } | null>(null)
  const [editHistory, setEditHistory] = useState<string[]>([])
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [editPreviewExpanded, setEditPreviewExpanded] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSave = useCallback((msgs: Message[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveHistory(msgs), 500)
  }, [])

  useEffect(() => { debouncedSave(messages) }, [messages, debouncedSave])

  useEffect(() => {
    const handler = (event: { type: string; content: string }) => {
      if (event.type === 'text') {
        setStreamContent((prev) => prev + event.content)
      } else if (event.type === 'done') {
        setIsStreaming(false)
      } else if (event.type === 'error') {
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: friendlyError(event.content) }])
        setStreamContent('')
        setIsStreaming(false)
      }
    }
    const cleanup = window.api.onAiStream(handler)
    return () => { cleanup() }
  }, [])

  const prevStreaming = useRef(false)
  useEffect(() => {
    if (prevStreaming.current && !isStreaming && streamContent) {
      const sources = pendingSourcesRef.current.length > 0 ? [...pendingSourcesRef.current] : undefined
      setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: streamContent, sources }])
      pendingSourcesRef.current = []
      setStreamContent('')
    }
    prevStreaming.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    const cleanup = window.api.onAiSources((sources) => { pendingSourcesRef.current = sources })
    return () => { cleanup() }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: isStreaming ? 'auto' : 'smooth' })
  }, [messages, streamContent])

  useEffect(() => {
    if (!showMention || !vaultPath) return
    const search = async () => {
      if (mentionQuery.trim()) {
        const results = await window.api.invoke('db:search-notes', { vaultPath, query: mentionQuery })
        setMentionResults(results.slice(0, 6))
      } else {
        const results = await window.api.invoke('db:get-all-notes', { vaultPath })
        setMentionResults(results.slice(0, 6))
      }
    }
    search()
  }, [showMention, mentionQuery, vaultPath])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)
    const atIndex = val.lastIndexOf('@')
    if (atIndex >= 0 && (atIndex === 0 || val[atIndex - 1] === ' ')) {
      setShowMention(true)
      setMentionQuery(val.slice(atIndex + 1))
    } else {
      setShowMention(false)
    }
  }

  const handleSelectMention = (note: { title: string; filePath: string }) => {
    if (editMode) {
      setEditTarget(note.filePath)
    } else {
      setAttachedNotes((prev) => prev.some((n) => n.filePath === note.filePath) ? prev : [...prev, note])
    }
    const atIndex = input.lastIndexOf('@')
    setInput(atIndex >= 0 ? input.slice(0, atIndex) : input)
    setShowMention(false)
    inputRef.current?.focus()
  }

  const handleSend = async () => {
    if (!input.trim()) return

    if (isStreaming) {
      setIsStreaming(false)
      if (streamContent) {
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: streamContent }])
        setStreamContent('')
      }
    }

    const providers = await window.api.invoke('ai:get-providers', undefined)
    if (!providers || providers.length === 0 || !providers.some((p: any) => p.enabled)) {
      toast('请先在设置中配置 AI 提供商', 'error')
      return
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamContent('')

    if (editMode) {
      const targetPath = editTarget || useEditorStore.getState().currentFilePath
      if (!targetPath) { setIsStreaming(false); return }
      try {
        const fileContent = await window.api.invoke('file:read', { path: targetPath })
        const result = await window.api.invoke('ai:edit', {
          instruction: userMsg.content,
          fileContent,
          filePath: targetPath,
          images: attachedImages.length > 0 ? attachedImages : undefined,
          history: editHistory.length > 0 ? editHistory : undefined
        } as any)
        setAttachedImages([])
        if (result.success && result.content) {
          setEditHistory((prev) => [...prev, userMsg.content])
          setEditResult({ content: result.content, filePath: targetPath })
          setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: '已生成修改方案，请查看下方预览并确认应用。' }])
        } else {
          setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: `编辑失败: ${result.error}` }])
        }
      } catch (e: any) {
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: friendlyError(e.message || '') }])
      }
      setIsStreaming(false)
      return
    }

    let contextPrefix = ''
    if (attachedNotes.length > 0 && vaultPath) {
      for (const note of attachedNotes) {
        try {
          const content = await window.api.invoke('file:read', { path: note.filePath })
          contextPrefix += `[笔记: ${note.title}]\n${content}\n\n`
        } catch {}
      }
      setAttachedNotes([])
    }

    const allMessages = [...messages, userMsg]
    const MAX_CONTEXT_MESSAGES = 20
    const recentMessages = allMessages.length > MAX_CONTEXT_MESSAGES
      ? allMessages.slice(-MAX_CONTEXT_MESSAGES)
      : allMessages
    const chatMessages = recentMessages.map((m) => ({ role: m.role, content: m.content }))
    if (contextPrefix) {
      chatMessages[chatMessages.length - 1] = {
        role: 'user',
        content: `以下是参考笔记内容：\n\n${contextPrefix}\n用户问题：${userMsg.content}`
      }
    }
    if (attachedImages.length > 0) {
      chatMessages[chatMessages.length - 1] = {
        role: 'user',
        content: [
          { type: 'text', text: chatMessages[chatMessages.length - 1].content as string },
          ...attachedImages.map((img) => ({ type: 'image_url' as const, image_url: { url: img } }))
        ] as any
      }
      setAttachedImages([])
    }
    try {
      await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined } as any)
    } catch (e: any) {
      setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: friendlyError(e.message || '') }])
      setStreamContent('')
      setIsStreaming(false)
    }
  }

  const handleApplyEdit = async () => {
    if (!editResult) return
    await window.api.invoke('file:write', { path: editResult.filePath, content: editResult.content, vaultPath: vaultPath || undefined })
    const store = useEditorStore.getState()
    const tabIndex = store.tabs.findIndex((t) => t.path === editResult.filePath)
    if (tabIndex >= 0) {
      const tabs = [...store.tabs]
      tabs[tabIndex] = { ...tabs[tabIndex], content: editResult.content, isDirty: false }
      const isActive = tabIndex === store.activeTabIndex
      useEditorStore.setState({
        tabs,
        ...(isActive ? { content: editResult.content, isDirty: false } : {})
      })
      if (isActive) {
        window.dispatchEvent(new CustomEvent('editor-reload-content', { detail: { content: editResult.content } }))
      }
    } else {
      await store.openFile(editResult.filePath)
    }
    const appliedFile = editResult.filePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || ''
    setEditResult(null)
    setEditPreviewExpanded(false)
    setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: `已应用修改到「${appliedFile}」。` }])
  }

  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          if (reader.result) setAttachedImages((prev) => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const [confirmClear, setConfirmClear] = useState(false)

  const handleClear = () => {
    if (messages.length > 3) {
      setConfirmClear(true)
      return
    }
    doClear()
  }

  const doClear = () => {
    setMessages([])
    try { safeRemove(STORAGE_KEY) } catch {}
    setConfirmClear(false)
  }

  const handleExport = async () => {
    if (!vaultPath || messages.length === 0) return
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '')
    const fileName = `AI对话_${dateStr}_${timeStr}.md`
    const lines = [`# AI 对话 ${dateStr}\n`]
    for (const msg of messages) {
      if (msg.role === 'user') {
        lines.push(`## 问\n\n${msg.content}\n`)
      } else {
        lines.push(`## 答\n\n${msg.content}\n`)
        if (msg.sources && msg.sources.length > 0) {
          lines.push(`> 来源: ${msg.sources.map((s) => s.title).join(', ')}\n`)
        }
      }
    }
    const content = lines.join('\n')
    const path = `${vaultPath}/${fileName}`
    await window.api.invoke('file:create', { path, content })
    const { openFile } = await import('../../stores/editor-store').then((m) => m.useEditorStore.getState())
    openFile(path)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '0 14px', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
        {messages.length > 0 && (
          <>
            <button onClick={handleExport} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, transition: 'color 100ms' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >
              导出
            </button>
            <button onClick={handleClear} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, transition: 'color 100ms' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            >
              清空
            </button>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ padding: '32px 16px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, fontWeight: 500 }}>可以帮你做什么？</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { text: '总结当前笔记的要点', icon: '📝' },
                { text: '基于笔记内容提问', icon: '💡' },
                { text: '切换编辑模式修改文档', icon: '✎' },
                { text: '@ 引用笔记作为上下文', icon: '@' },
              ].map((hint) => (
                <button
                  key={hint.text}
                  onClick={() => { setInput(hint.text === '@ 引用笔记作为上下文' ? '@' : hint.text); inputRef.current?.focus() }}
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
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {isStreaming && streamContent && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ maxWidth: '88%', borderRadius: '14px 14px 14px 4px', padding: '10px 14px', fontSize: 13, lineHeight: 1.7, background: 'var(--bg-elevated)', color: 'var(--text-primary)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                <div className="editor-content" style={{ fontSize: 13, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(streamContent) }} />
              </div>
            </div>
          )}
          {isStreaming && !streamContent && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ borderRadius: '14px 14px 14px 4px', padding: '12px 16px', background: 'var(--bg-elevated)', display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite', opacity: 0.7 }} />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite 0.2s', opacity: 0.7 }} />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite 0.4s', opacity: 0.7 }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit result preview */}
      {editResult && (
        <div style={{ padding: '8px 14px', flexShrink: 0 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: editPreviewExpanded ? '70vh' : 'none' }}>
            <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--accent-muted)', borderBottom: '1px solid var(--accent)', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 500 }}>修改预览: {editResult.filePath.split(/[\\/]/).pop()}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setEditPreviewExpanded(!editPreviewExpanded)}
                  style={{ height: 22, padding: '0 6px', fontSize: 10, background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer' }}
                  title={editPreviewExpanded ? '收起' : '展开全部'}
                >
                  {editPreviewExpanded ? '收起' : '展开'}
                </button>
                <button onClick={handleApplyEdit} style={{ height: 22, padding: '0 10px', fontSize: 10, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>应用</button>
                <button onClick={() => { setEditResult(null); setEditPreviewExpanded(false) }} style={{ height: 22, padding: '0 8px', fontSize: 10, background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer' }}>放弃</button>
              </div>
            </div>
            <div
              className="editor-content"
              style={{ padding: '12px 16px', maxHeight: editPreviewExpanded ? 'none' : 200, overflowY: 'auto', fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(editResult.content) }}
            />
          </div>
        </div>
      )}

      {/* Attached images */}
      {attachedImages.length > 0 && (
        <div style={{ padding: '4px 16px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {attachedImages.map((img, i) => (
            <div key={i} style={{ position: 'relative', width: 48, height: 48, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 8, padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Attached notes */}
      {attachedNotes.length > 0 && (
        <div style={{ padding: '4px 16px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {attachedNotes.map((note) => (
            <span key={note.filePath} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'var(--accent-muted)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {note.title}
              <button onClick={() => setAttachedNotes((prev) => prev.filter((n) => n.filePath !== note.filePath))} style={{ width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--accent-text)', cursor: 'pointer', padding: 0 }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Mention dropdown */}
      {showMention && mentionResults.length > 0 && (
        <div style={{ padding: '0 16px 4px' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 4, maxHeight: 180, overflowY: 'auto' }}>
            {mentionResults.map((note) => (
              <button
                key={note.filePath}
                onClick={() => handleSelectMention(note)}
                style={{ width: '100%', height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {note.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '10px 14px 14px', flexShrink: 0 }}>
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1.5px solid var(--border-subtle)',
          borderRadius: 12,
          transition: 'border-color 150ms, box-shadow 150ms',
          overflow: 'hidden',
        }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,110,240,0.08)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'none' }}
        >
          {/* Edit target indicator */}
          {editMode && (
            <div style={{ padding: '6px 12px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--accent-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {editTarget ? editTarget.split(/[\\/]/).pop()?.replace(/\.md$/, '') : (useEditorStore.getState().currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '未打开文件')}
              </span>
              {editTarget && (
                <button onClick={() => setEditTarget(null)} style={{ width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', padding: '8px 8px 8px 12px', gap: 6 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => handleInputChange(e as any)}
              onPaste={handleImagePaste as any}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !showMention) { e.preventDefault(); handleSend() }; if (e.key === 'Escape') setShowMention(false) }}
              placeholder={editMode ? '描述你想要的修改...' : '提问，或 @ 引用笔记'}
              rows={1}
              onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }}
              style={{
                flex: 1, minHeight: 28, maxHeight: 120, padding: '4px 0', fontSize: 13,
                background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none',
                minWidth: 0, resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              }}
            />
            {isStreaming ? (
              <button
                onClick={() => { setIsStreaming(false); setStreamContent('') }}
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                  border: '1.5px solid var(--border-default)', borderRadius: 8,
                  cursor: 'pointer', flexShrink: 0, transition: 'border-color 100ms',
                }}
                title="停止生成"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: !input.trim() ? 'transparent' : 'var(--accent)',
                  color: !input.trim() ? 'var(--text-tertiary)' : '#fff',
                  border: 'none', borderRadius: 8,
                  cursor: !input.trim() ? 'default' : 'pointer',
                  transition: 'background 150ms, color 150ms',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            )}
          </div>

          {/* Bottom toolbar */}
          <div style={{ padding: '0 8px 6px', display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => { setEditMode(!editMode); setEditTarget(null); setEditHistory([]) }}
              style={{
                height: 22, padding: '0 8px', fontSize: 11, fontWeight: 500, borderRadius: 5, cursor: 'pointer',
                background: editMode ? 'var(--accent-muted)' : 'transparent',
                color: editMode ? 'var(--accent-text)' : 'var(--text-tertiary)',
                border: 'none',
                transition: 'all 100ms',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              title={editMode ? '切换到对话模式' : '切换到编辑模式（直接修改文档）'}
            >
              {editMode ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              )}
              {editMode ? '编辑' : '对话'}
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', opacity: 0.6 }}>Enter 发送 · Shift+Enter 换行</span>
          </div>
        </div>
      </div>
      <ConfirmModal
        open={confirmClear}
        title="清空对话"
        message={`确定清空 ${messages.length} 条对话记录？此操作无法撤销。`}
        confirmText="清空"
        danger
        onConfirm={doClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}

marked.setOptions({ breaks: true, gfm: true })

const PURIFY_CONFIG = {
  FORBID_TAGS: ['form', 'iframe', 'object', 'embed', 'script', 'style', 'link', 'meta'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
}

function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

const MessageBubble = memo(function MessageBubble({ msg }: { msg: Message }) {
  return (
    <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '88%' }}>
        <div style={{
          borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          padding: '10px 14px', fontSize: 13, lineHeight: 1.7,
          background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
          color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
          wordBreak: 'break-word', overflowWrap: 'anywhere',
        }}>
          {msg.role === 'user' ? (
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
          ) : (
            <div className="editor-content" style={{ fontSize: 13, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
          )}
        </div>
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
