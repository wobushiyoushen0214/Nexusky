import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import { ConfirmModal } from '../ConfirmModal'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; filePath: string; chunk: string; score: number }[]
}

interface FileEntry { name: string; path: string; isDirectory: boolean; children?: FileEntry[] }

function flattenMdFiles(entries: FileEntry[]): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = []
  for (const entry of entries) {
    if (entry.isDirectory && entry.children) {
      result.push(...flattenMdFiles(entry.children))
    } else if (entry.name.endsWith('.md')) {
      result.push({ name: entry.name, path: entry.path })
    }
  }
  return result
}

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

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const pendingSourcesRef = useRef<any[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const isStreamingRef = useRef(false)
  useEffect(() => { isStreamingRef.current = isStreaming }, [isStreaming])
  const [streamContent, setStreamContent] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<{ title: string; filePath: string }[]>([])
  const [attachedNotes, setAttachedNotes] = useState<{ title: string; filePath: string }[]>([])
  const [attachedSelections, setAttachedSelections] = useState<{ text: string; source: string }[]>([])
  const [editMode, setEditMode] = useState(false)
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editResult, setEditResult] = useState<{ content: string; filePath: string } | null>(null)
  const [editHistory, setEditHistory] = useState<string[]>([])
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [editPreviewExpanded, setEditPreviewExpanded] = useState(false)
  const [editElapsed, setEditElapsed] = useState(0)
  const editTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!vaultPath) return
    window.api.invoke('db:chat-history-load', { vaultPath }).then((rows) => {
      if (rows && rows.length > 0) {
        setMessages(rows.map((r) => ({ id: r.id, role: r.role as 'user' | 'assistant', content: r.content, sources: r.sources })))
      }
    }).catch(() => {})
  }, [vaultPath])

  const appendToDb = useCallback((msg: Message) => {
    if (!vaultPath) return
    window.api.invoke('db:chat-history-append', { vaultPath, role: msg.role, content: msg.content, sources: msg.sources }).catch(() => {})
  }, [vaultPath])

  useEffect(() => {
    const handler = (event: { type: string; content: string }) => {
      if (!isStreamingRef.current) return
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
      const msg: Message = { id: Date.now().toString(), role: 'assistant', content: streamContent, sources }
      setMessages((msgs) => [...msgs, msg])
      appendToDb(msg)
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
      setMentionIndex(0)
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
      setShowMention(false)
    } else {
      setAttachedNotes((prev) => prev.some((n) => n.filePath === note.filePath) ? prev : [...prev, note])
    }
    const atIndex = input.lastIndexOf('@')
    setInput(atIndex >= 0 ? input.slice(0, atIndex) : input)
    inputRef.current?.focus()
  }

  const handleAttachSelection = () => {
    const sel = window.getSelection()?.toString()
    if (!sel || sel.length < 3) {
      toast('请先在编辑器中选中一段文本', 'info')
      return
    }
    const source = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '选中文本'
    setAttachedSelections((prev) => [...prev, { text: sel.slice(0, 2000), source }])
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
    appendToDb(userMsg)
    setInput('')
    setIsStreaming(true)
    setStreamContent('')

    if (editMode) {
      const targetPath = editTarget || currentFilePath
      if (!targetPath) { setIsStreaming(false); return }
      setEditElapsed(0)
      editTimerRef.current = setInterval(() => setEditElapsed((t) => t + 1), 1000)
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
      if (editTimerRef.current) clearInterval(editTimerRef.current)
      editTimerRef.current = null
      setIsStreaming(false)
      return
    }

    let contextPrefix = ''
    if (attachedNotes.length > 0 && vaultPath) {
      for (const note of attachedNotes) {
        try {
          const fullPath = note.filePath.startsWith('/') || note.filePath.includes(':')
            ? note.filePath
            : `${vaultPath}/${note.filePath}`
          const content = await window.api.invoke('file:read', { path: fullPath })
          contextPrefix += `[笔记: ${note.title}]\n${content}\n\n`
        } catch {}
      }
      setAttachedNotes([])
    }
    if (attachedSelections.length > 0) {
      for (const sel of attachedSelections) {
        contextPrefix += `[选中片段: ${sel.source}]\n${sel.text}\n\n`
      }
      setAttachedSelections([])
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
    if (vaultPath) window.api.invoke('db:chat-history-clear', { vaultPath }).catch(() => {})
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

  const [dragOver, setDragOver] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = dropZoneRef.current
    if (!el) return

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }

    const handleDragLeave = (e: DragEvent) => {
      const related = e.relatedTarget as Node | null
      if (related && el.contains(related)) return
      setDragOver(false)
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      setDragOver(false)

      const text = e.dataTransfer?.getData('text/plain') || ''

      // From file tree: text/plain contains a path
      if (text) {
        if (text.endsWith('.md')) {
          const title = text.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '笔记'
          setAttachedNotes((prev) => prev.some((n) => n.filePath === text) ? prev : [...prev, { title, filePath: text }])
          return
        }
        // Folder path (no extension or doesn't end with .md) — list .md files inside
        if (vaultPath && !text.includes('\n') && (text.startsWith('/') || text.includes(':'))) {
          try {
            const files = await window.api.invoke('file:list', { dirPath: text })
            const mdFiles = flattenMdFiles(files)
            for (const f of mdFiles) {
              setAttachedNotes((prev) => prev.some((n) => n.filePath === f.path) ? prev : [...prev, { title: f.name.replace(/\.md$/, ''), filePath: f.path }])
            }
            if (mdFiles.length > 0) return
          } catch {}
        }
        // Plain text
        if (text.length >= 3) {
          const source = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '拖入文本'
          setAttachedSelections((prev) => [...prev, { text: text.slice(0, 2000), source }])
          return
        }
      }

      // From OS file manager: dataTransfer.files
      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.name.endsWith('.md') && (file as any).path) {
            const filePath = (file as any).path as string
            const title = file.name.replace(/\.md$/, '')
            setAttachedNotes((prev) => prev.some((n) => n.filePath === filePath) ? prev : [...prev, { title, filePath }])
          }
        }
      }
    }

    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop, true)
    return () => {
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('dragleave', handleDragLeave)
      el.removeEventListener('drop', handleDrop, true)
    }
  }, [vaultPath, currentFilePath])

  return (
    <div
      ref={dropZoneRef}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(124,110,240,0.06)', border: '2px dashed var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 13, color: 'var(--accent-text)', fontWeight: 500 }}>松开以引用文件或文本</span>
        </div>
      )}
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
              <div style={{ borderRadius: '14px 14px 14px 4px', padding: '12px 16px', background: 'var(--bg-elevated)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite', opacity: 0.7 }} />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite 0.2s', opacity: 0.7 }} />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite 0.4s', opacity: 0.7 }} />
                {editMode && editElapsed > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>{editElapsed}s</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit result preview */}
      {editResult && (
        <div style={{ padding: '8px 14px', flexShrink: 0, maxHeight: editPreviewExpanded ? 'calc(50% - 60px)' : 'none', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: editPreviewExpanded ? 1 : 'none', minHeight: 0 }}>
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{editResult.filePath.split(/[\\/]/).pop()}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setEditPreviewExpanded(!editPreviewExpanded)}
                  style={{ height: 24, padding: '0 8px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 5, cursor: 'pointer', transition: 'all 100ms' }}
                >
                  {editPreviewExpanded ? '收起' : '展开'}
                </button>
                <button onClick={handleApplyEdit} style={{ height: 24, padding: '0 12px', fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 500 }}>应用修改</button>
                <button onClick={() => { setEditResult(null); setEditPreviewExpanded(false) }} style={{ height: 24, padding: '0 8px', fontSize: 11, background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 5, cursor: 'pointer' }}>放弃</button>
              </div>
            </div>
            <div
              className="editor-content"
              style={{ padding: '12px 16px', maxHeight: editPreviewExpanded ? 'none' : 120, overflowY: 'auto', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', flex: editPreviewExpanded ? 1 : 'none', minHeight: 0 }}
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

      {/* Attached selections */}
      {attachedSelections.length > 0 && (
        <div style={{ padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {attachedSelections.map((sel, i) => (
            <div key={i} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{sel.source}:</span> {sel.text.slice(0, 80)}{sel.text.length > 80 ? '...' : ''}
              </span>
              <button onClick={() => setAttachedSelections((prev) => prev.filter((_, j) => j !== i))} style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Mention dropdown */}
      {showMention && mentionResults.length > 0 && (
        <div style={{ padding: '0 16px 4px' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 4, maxHeight: 180, overflowY: 'auto' }}>
            {mentionResults.map((note, i) => (
              <button
                key={note.filePath}
                onClick={() => handleSelectMention(note)}
                style={{ width: '100%', height: 28, padding: '0 10px', display: 'flex', alignItems: 'center', fontSize: 12, color: i === mentionIndex ? 'var(--text-primary)' : 'var(--text-secondary)', background: i === mentionIndex ? 'var(--bg-hover)' : 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={() => setMentionIndex(i)}
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
                {editTarget ? editTarget.split(/[\\/]/).pop()?.replace(/\.md$/, '') : (currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '未打开文件')}
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
              onKeyDown={(e) => {
                if (showMention && mentionResults.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionResults.length - 1)); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return }
                  if (e.key === 'Enter') { e.preventDefault(); handleSelectMention(mentionResults[mentionIndex]); return }
                }
                if (e.key === 'Enter' && !e.shiftKey && !showMention) { e.preventDefault(); handleSend() }
                if (e.key === 'Escape') setShowMention(false)
              }}
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
                onClick={() => { window.api.invoke('ai:stop', undefined); setIsStreaming(false); setStreamContent('') }}
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
            <button
              onClick={handleAttachSelection}
              style={{
                height: 22, padding: '0 8px', fontSize: 11, fontWeight: 500, borderRadius: 5, cursor: 'pointer',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                border: 'none',
                transition: 'all 100ms',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              title="引用编辑器中选中的文本作为上下文"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
              引用选中
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
