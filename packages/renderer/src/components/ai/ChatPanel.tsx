import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; filePath: string; chunk: string; score: number }[]
}

const STORAGE_KEY = 'nexusky-chat-history'

function loadHistory(): Message[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return []
}

function saveHistory(messages: Message[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)))
  } catch {}
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
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { saveHistory(messages) }, [messages])

  useEffect(() => {
    const handler = (event: { type: string; content: string }) => {
      if (event.type === 'text') {
        setStreamContent((prev) => prev + event.content)
      } else if (event.type === 'done') {
        setIsStreaming(false)
      } else if (event.type === 'error') {
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: `错误: ${event.content}` }])
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
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
    if (!input.trim() || isStreaming) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamContent('')

    if (editMode) {
      const targetPath = editTarget || useEditorStore.getState().currentFilePath
      if (!targetPath) { setIsStreaming(false); return }
      const fileContent = await window.api.invoke('file:read', { path: targetPath })
      const result = await window.api.invoke('ai:edit', {
        instruction: userMsg.content,
        fileContent,
        filePath: targetPath,
        images: attachedImages.length > 0 ? attachedImages : undefined
      })
      setAttachedImages([])
      if (result.success && result.content) {
        setEditResult({ content: result.content, filePath: targetPath })
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: '已生成修改方案，请查看下方预览并确认应用。' }])
      } else {
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: `编辑失败: ${result.error}` }])
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

    const chatMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
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
    await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined } as any)
  }

  const handleApplyEdit = async () => {
    if (!editResult) return
    await window.api.invoke('file:write', { path: editResult.filePath, content: editResult.content, vaultPath: vaultPath || undefined })
    const store = useEditorStore.getState()
    const tabIndex = store.tabs.findIndex((t) => t.path === editResult.filePath)
    if (tabIndex >= 0) {
      const tabs = [...store.tabs]
      tabs[tabIndex] = { ...tabs[tabIndex], content: editResult.content, isDirty: false }
      useEditorStore.setState({ tabs, content: editResult.content, isDirty: false })
    } else {
      store.openFile(editResult.filePath)
    }
    setEditResult(null)
    setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: '修改已应用。' }])
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

  const handleClear = () => {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
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
      {/* Header with clear button */}
      <div style={{ padding: '0 16px', height: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
        {messages.length > 0 && (
          <>
            <button onClick={handleExport} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}>
              导出为笔记
            </button>
            <button onClick={handleClear} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}>
              清空对话
            </button>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>向 AI 提问关于你的笔记</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, opacity: 0.6 }}>输入 @ 可引用特定笔记作为上下文</p>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '85%' }}>
                <div style={{
                  borderRadius: 12, padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                }}>
                  {msg.role === 'user' ? (
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                  ) : (
                    <div className="editor-content" style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  )}
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
                <div className="editor-content" style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(streamContent) }} />
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

      {/* Edit result preview */}
      {editResult && (
        <div style={{ padding: '8px 16px' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--accent-muted)', borderBottom: '1px solid var(--accent)' }}>
              <span style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 500 }}>修改预览: {editResult.filePath.split(/[\\/]/).pop()}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleApplyEdit} style={{ height: 22, padding: '0 10px', fontSize: 10, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>应用修改</button>
                <button onClick={() => setEditResult(null)} style={{ height: 22, padding: '0 8px', fontSize: 10, background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer' }}>放弃</button>
              </div>
            </div>
            <div
              className="editor-content"
              style={{ padding: '12px 16px', maxHeight: 200, overflowY: 'auto', fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)' }}
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
      <div style={{ padding: '8px 16px 12px' } as React.CSSProperties}>
        {/* Mode toggle + target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <button
            onClick={() => { setEditMode(!editMode); setEditTarget(null) }}
            style={{
              height: 24, padding: '0 8px', fontSize: 10, fontWeight: 500, borderRadius: 5, cursor: 'pointer',
              background: editMode ? 'var(--accent)' : 'var(--bg-elevated)',
              color: editMode ? '#fff' : 'var(--text-tertiary)',
              border: editMode ? 'none' : '1px solid var(--border-subtle)',
            }}
          >
            {editMode ? '编辑模式' : '对话模式'}
          </button>
          {editMode && (
            <span style={{ fontSize: 10, color: editTarget ? 'var(--accent-text)' : 'var(--text-tertiary)' }}>
              目标: {editTarget ? editTarget.split(/[\\/]/).pop()?.replace(/\.md$/, '') : (useEditorStore.getState().currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '未打开文件')}
            </span>
          )}
          {editMode && editTarget && (
            <button
              onClick={() => setEditTarget(null)}
              style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}
              title="重置为当前文件"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onPaste={handleImagePaste}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !showMention) { e.preventDefault(); handleSend() }; if (e.key === 'Escape') setShowMention(false) }}
            placeholder={editMode ? '输入修改指令... (如: 在开头添加摘要)' : '输入消息... (@ 引用笔记)'}
            disabled={isStreaming}
            style={{
              flex: 1, height: 36, padding: '0 14px', fontSize: 13,
              background: 'var(--bg-elevated)', border: `1px solid ${editMode ? 'var(--accent)' : 'var(--border-subtle)'}`,
              borderRadius: 10, color: 'var(--text-primary)', outline: 'none',
              opacity: isStreaming ? 0.5 : 1, transition: 'border-color 150ms',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = editMode ? 'var(--accent)' : 'var(--border-subtle)' }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            style={{
              height: 36, padding: '0 16px', fontSize: 12, fontWeight: 500,
              background: editMode ? '#4ade80' : 'var(--accent)', color: editMode ? '#000' : '#fff', border: 'none', borderRadius: 8,
              cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
              opacity: isStreaming || !input.trim() ? 0.4 : 1, transition: 'opacity 150ms',
            }}
          >
            {editMode ? '执行' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

function renderMarkdown(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hupbl]|<li|<hr|<code|<pre)(.+)$/gm, '<p>$1</p>')
}
