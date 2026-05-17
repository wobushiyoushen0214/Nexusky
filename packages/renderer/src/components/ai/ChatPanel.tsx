import { useState, useEffect, useRef, useCallback } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import { ConfirmModal } from '../ConfirmModal'
import { ChatMessages } from './ChatMessages'
import { renderMarkdown } from './MessageBubble'
import type { Message } from './MessageBubble'

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
  const streamContentRef = useRef('')
  const contextSummaryRef = useRef<string | null>(null)
  const summarizedCountRef = useRef(0)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [agentMode, setAgentMode] = useState(() => {
    try { return localStorage.getItem('nexusky-agent-mode') !== '0' } catch { return true }
  })
  const updateAgentMode = (v: boolean) => {
    setAgentMode(v)
    try { localStorage.setItem('nexusky-agent-mode', v ? '1' : '0') } catch {}
  }

  // Multi-session state
  const [sessions, setSessions] = useState<{ id: string; title: string; createdAt: number; updatedAt: number }[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    try { return localStorage.getItem('nexusky-chat-session-id') || null } catch { return null }
  })
  const updateSessionId = (id: string | null) => {
    setCurrentSessionId(id)
    try { if (id) localStorage.setItem('nexusky-chat-session-id', id); else localStorage.removeItem('nexusky-chat-session-id') } catch {}
  }
  const [showSessions, setShowSessions] = useState(false)
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<{ title: string; filePath: string }[]>([])
  const [attachedNotes, setAttachedNotes] = useState<{ title: string; filePath: string }[]>([])
  const [attachedSelections, setAttachedSelections] = useState<{ text: string; source: string }[]>([])
  const [editMode, setEditMode] = useState(() => {
    try { return localStorage.getItem('nexusky-chat-edit-mode') === '1' } catch { return false }
  })
  const updateEditMode = (v: boolean) => {
    setEditMode(v)
    try { localStorage.setItem('nexusky-chat-edit-mode', v ? '1' : '0') } catch {}
  }
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editResult, setEditResult] = useState<{ content: string; filePath: string } | null>(null)
  const [editHistory, setEditHistory] = useState<string[]>([])
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [editPreviewExpanded, setEditPreviewExpanded] = useState(false)
  const [editElapsed, setEditElapsed] = useState(0)
  const editTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [pendingBatch, setPendingBatch] = useState<{ instruction: string } | null>(null)
  const [folderOptions, setFolderOptions] = useState<string[]>([])
  const [editUnbound, setEditUnbound] = useState(false)

  useEffect(() => {
    if (!vaultPath) return
    window.api.invoke('db:chat-sessions-list', { vaultPath }).then(setSessions).catch(() => {})
    window.api.invoke('db:chat-history-load', { vaultPath, sessionId: currentSessionId || undefined }).then((rows) => {
      if (rows && rows.length > 0) {
        setMessages(rows.map((r) => ({ id: r.id, role: r.role as 'user' | 'assistant', content: r.content, sources: r.sources })))
      } else {
        setMessages([])
      }
    }).catch(() => {})
  }, [vaultPath, currentSessionId])

  const appendToDb = useCallback((msg: Message) => {
    if (!vaultPath) return
    window.api.invoke('db:chat-history-append', { vaultPath, role: msg.role, content: msg.content, sources: msg.sources, sessionId: currentSessionId || undefined }).catch(() => {})
  }, [vaultPath, currentSessionId])

  const handleNewSession = async () => {
    if (!vaultPath) return
    const id = crypto.randomUUID()
    const title = `对话 ${sessions.length + 1}`
    await window.api.invoke('db:chat-session-create', { vaultPath, id, title })
    updateSessionId(id)
    setMessages([])
    contextSummaryRef.current = null
    summarizedCountRef.current = 0
    setSessions((prev) => [{ id, title, createdAt: Date.now() / 1000, updatedAt: Date.now() / 1000 }, ...prev])
  }

  const handleSwitchSession = (sessionId: string | null) => {
    updateSessionId(sessionId)
    setShowSessions(false)
    contextSummaryRef.current = null
    summarizedCountRef.current = 0
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!vaultPath) return
    await window.api.invoke('db:chat-session-delete', { vaultPath, sessionId })
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    if (currentSessionId === sessionId) {
      updateSessionId(null)
      setMessages([])
    }
  }

  useEffect(() => {
    const handler = (event: { type: string; content: string }) => {
      if (!isStreamingRef.current) return
      if (event.type === 'text') {
        setToolStatus(null)
        streamContentRef.current += event.content
        setStreamContent(streamContentRef.current)
      } else if (event.type === 'done') {
        setToolStatus(null)
        setIsStreaming(false)
      } else if (event.type === 'error') {
        setToolStatus(null)
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: friendlyError(event.content) }])
        streamContentRef.current = ''
        setStreamContent('')
        setIsStreaming(false)
      } else if (event.type === 'retry') {
        setToolStatus(event.content)
      } else if (event.type === 'tool_call') {
        try {
          const data = JSON.parse(event.content)
          const toolNames: Record<string, string> = { search_notes: '搜索笔记', read_note: '读取笔记', create_note: '创建笔记', edit_note: '编辑笔记' }
          setToolStatus(toolNames[data.name] || data.name)
        } catch {
          setToolStatus('调用工具...')
        }
      }
    }
    const cleanup = window.api.onAiStream(handler)
    return () => { cleanup() }
  }, [])

  const prevStreaming = useRef(false)
  const editCompleteRef = useRef(false)
  useEffect(() => {
    if (prevStreaming.current && !isStreaming && streamContentRef.current && !editCompleteRef.current) {
      const sources = pendingSourcesRef.current.length > 0 ? [...pendingSourcesRef.current] : undefined
      const msg: Message = { id: Date.now().toString(), role: 'assistant', content: streamContentRef.current, sources }
      setMessages((msgs) => [...msgs, msg])
      appendToDb(msg)
      pendingSourcesRef.current = []
      streamContentRef.current = ''
      setStreamContent('')
    }
    editCompleteRef.current = false
    prevStreaming.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    const cleanup = window.api.onAiSources((sources) => { pendingSourcesRef.current = sources })
    return () => { cleanup() }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail
      if (text === '@ 引用笔记作为上下文') { setInput('@'); inputRef.current?.focus() }
      else if (text === '生成知识图谱') {
        const fp = useEditorStore.getState().currentFilePath
        if (fp) window.dispatchEvent(new CustomEvent('generate-graph', { detail: { path: fp, isDirectory: false } }))
        else toast('请先打开一个笔记', 'info')
      }
      else { setInput(text); inputRef.current?.focus() }
    }
    window.addEventListener('chat-hint-click', handler)
    return () => window.removeEventListener('chat-hint-click', handler)
  }, [])

  const handleRegenerate = useCallback(async (msg: Message) => {
    if (isStreaming) return
    const msgIndex = messages.findIndex((m) => m.id === msg.id)
    if (msgIndex < 0) return
    const userMsgIndex = msgIndex - 1
    if (userMsgIndex < 0 || messages[userMsgIndex].role !== 'user') return
    const userContent = messages[userMsgIndex].content
    const remaining = messages.slice(0, msgIndex)
    setMessages(remaining)
    if (vaultPath) {
      window.api.invoke('db:chat-history-clear', { vaultPath, sessionId: currentSessionId || undefined }).catch(() => {})
      for (const m of remaining) { appendToDb(m) }
    }

    const providers = await window.api.invoke('ai:get-providers', undefined)
    if (!providers || providers.length === 0 || !providers.some((p: any) => p.enabled)) {
      toast('请先在设置中配置 AI 提供商', 'error')
      return
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userContent }
    setMessages((prev) => [...prev, userMsg])
    appendToDb(userMsg)
    setIsStreaming(true)
    streamContentRef.current = ''
    setStreamContent('')

    const allMessages = [...remaining, userMsg]
    const chatMessages = await buildChatMessages(allMessages)
    try {
      if (agentMode && vaultPath) {
        await window.api.invoke('ai:chat-agent', { messages: chatMessages, vaultPath } as any)
      } else {
        await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined } as any)
      }
    } catch (e: any) {
      setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: friendlyError(e.message || '') }])
      streamContentRef.current = ''
      setStreamContent('')
      setIsStreaming(false)
    }
  }, [messages, isStreaming, vaultPath, currentSessionId, appendToDb])

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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

  const TOKEN_THRESHOLD = 12
  const RECENT_KEEP = 6

  const buildChatMessages = async (allMessages: Message[]): Promise<{ role: string; content: any }[]> => {
    if (allMessages.length <= TOKEN_THRESHOLD) {
      return allMessages.map((m) => ({ role: m.role, content: m.content }))
    }

    const recentMessages = allMessages.slice(-RECENT_KEEP)
    const oldMessages = allMessages.slice(0, -RECENT_KEEP)
    const oldCount = oldMessages.length

    // Cache hit: if we already summarized this many old messages, reuse the summary
    // Only regenerate when new messages have rolled into the "old" window
    if (contextSummaryRef.current && summarizedCountRef.current === oldCount) {
      return [
        { role: 'system', content: `以下是之前对话的摘要，请基于此上下文继续对话：\n${contextSummaryRef.current}` },
        ...recentMessages.map((m) => ({ role: m.role, content: m.content }))
      ]
    }

    // Incremental summarization: if we have an existing summary, fold new messages into it
    let summary: string | null = null
    const newOldMessages = oldMessages.slice(summarizedCountRef.current)

    if (contextSummaryRef.current && newOldMessages.length > 0 && newOldMessages.length <= 6) {
      // Incremental: merge existing summary with the few new messages that rolled over
      try {
        summary = await window.api.invoke('ai:complete', {
          system: `你是对话摘要助手。请将已有摘要与新增对话合并为一段更新后的摘要，保留：
1. 用户的核心意图和目标
2. 已讨论的关键主题和决策
3. AI 已完成的操作（如生成了哪些文件、修改了什么）
4. 重要的上下文信息（目录名、文件名、主题等）
用 3-5 句话概括，不要遗漏关键信息。只输出摘要。`,
          text: `已有摘要：\n${contextSummaryRef.current}\n\n新增对话：\n${newOldMessages.map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 300)}`).join('\n')}`
        })
      } catch {
        summary = contextSummaryRef.current
      }
    } else {
      // Full summarization: first time or too many new messages
      try {
        summary = await window.api.invoke('ai:complete', {
          system: `你是对话摘要助手。请将以下对话历史压缩为一段简洁的摘要，保留：
1. 用户的核心意图和目标
2. 已讨论的关键主题和决策
3. AI 已完成的操作（如生成了哪些文件、修改了什么）
4. 重要的上下文信息（目录名、文件名、主题等）
用 3-5 句话概括，不要遗漏关键信息。只输出摘要，不要其他文字。`,
          text: oldMessages.map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 300)}`).join('\n')
        })
      } catch {
        summary = oldMessages.map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 80)}`).join('\n')
      }
    }

    if (summary) {
      contextSummaryRef.current = summary
      summarizedCountRef.current = oldCount
    }

    return [
      { role: 'system', content: `以下是之前对话的摘要，请基于此上下文继续对话：\n${summary}` },
      ...recentMessages.map((m) => ({ role: m.role, content: m.content }))
    ]
  }

  const executeBatchGenerate = async (instruction: string, targetDir: string) => {
    setIsStreaming(true)
    streamContentRef.current = ''
    setStreamContent('')
    setEditElapsed(0)
    if (editTimerRef.current) clearInterval(editTimerRef.current)
    editTimerRef.current = setInterval(() => setEditElapsed((t) => t + 1), 1000)

    const planMsgId = Date.now().toString()
    let planItems: { title: string; done: boolean }[] = []

    const updatePlanMsg = () => {
      const lines = planItems.map((item) => `${item.done ? '✓' : '○'} ${item.title}`).join('\n')
      setMessages((msgs) => {
        const idx = msgs.findIndex((m) => m.id === planMsgId)
        if (idx >= 0) {
          const updated = [...msgs]
          updated[idx] = { ...updated[idx], content: lines }
          return updated
        }
        return msgs
      })
    }

    const cleanup = window.api.onAiNotesProgress((data) => {
      if (data.stage === 'planning') {
        setStreamContent('正在规划笔记结构...')
      } else if (data.stage === 'planned' && data.plan) {
        planItems = data.plan.map((p: any) => ({ title: p.title, done: false }))
        setStreamContent('')
        const lines = planItems.map((item) => `○ ${item.title}`).join('\n')
        setMessages((msgs) => [...msgs, { id: planMsgId, role: 'assistant', content: lines }])
      } else if (data.stage === 'generating' && data.current) {
        if (data.current > 1) {
          planItems[data.current - 2] = { ...planItems[data.current - 2], done: true }
        }
        updatePlanMsg()
      } else if (data.stage === 'indexing') {
        planItems = planItems.map((item) => ({ ...item, done: true }))
        updatePlanMsg()
        setStreamContent('正在索引笔记关系...')
      } else if (data.stage === 'index-error') {
        setStreamContent('')
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: `⚠️ ${data.message}（文件已生成，但知识图谱索引失败，可手动重建索引）` }])
      } else if (data.stage === 'done') {
        planItems = planItems.map((item) => ({ ...item, done: true }))
        updatePlanMsg()
        setStreamContent('')
      }
    })

    const result = await window.api.invoke('ai:generate-notes', { instruction, vaultPath: vaultPath!, targetDir })
    cleanup()

    // Mark all done
    planItems = planItems.map((item) => ({ ...item, done: true }))
    updatePlanMsg()

    if (result.success && result.files.length > 0) {
      useEditorStore.getState().openFile(result.files[0])
      useVaultStore.getState().refreshFiles()
      const dirName = targetDir.split(/[\\/]/).pop()
      const msg: Message = { id: Date.now().toString(), role: 'assistant', content: `已在「${dirName}」下生成 ${result.files.length} 个文件。` }
      setMessages((msgs) => [...msgs, msg])
      appendToDb(msg)
    } else if (result.files.length > 0) {
      useVaultStore.getState().refreshFiles()
      const msg: Message = { id: Date.now().toString(), role: 'assistant', content: `已停止，生成了 ${result.files.length} 个文件。` }
      setMessages((msgs) => [...msgs, msg])
    } else {
      setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: `生成失败: ${result.error || '未知错误'}` }])
    }
    setStreamContent('')
    if (editTimerRef.current) clearInterval(editTimerRef.current)
    editTimerRef.current = null
    editCompleteRef.current = true
    setIsStreaming(false)
    setPendingBatch(null)
    setFolderOptions([])
  }

  const handleSelectFolder = (folderName: string) => {
    if (!pendingBatch || !vaultPath) return
    const targetDir = `${vaultPath}/${folderName}`
    const confirmMsg: Message = { id: Date.now().toString(), role: 'user', content: folderName }
    setMessages((msgs) => [...msgs, confirmMsg])
    appendToDb(confirmMsg)
    setPendingBatch(null)
    setFolderOptions([])
    executeBatchGenerate(pendingBatch.instruction, targetDir)
  }

  const handleSend = async () => {
    if (!input.trim()) return

    if (isStreaming) {
      editCompleteRef.current = true
      setIsStreaming(false)
      if (streamContent) {
        const msg: Message = { id: Date.now().toString(), role: 'assistant', content: streamContent }
        setMessages((msgs) => [...msgs, msg])
        appendToDb(msg)
        setStreamContent('')
      }
    }

    const providers = await window.api.invoke('ai:get-providers', undefined)
    if (!providers || providers.length === 0 || !providers.some((p: any) => p.enabled)) {
      toast('请先在设置中配置 AI 提供商', 'error')
      return
    }

    const attachments: { type: 'note' | 'selection' | 'image'; label: string }[] = []
    if (attachedNotes.length > 0) {
      for (const note of attachedNotes) attachments.push({ type: 'note', label: note.title })
    }
    if (attachedSelections.length > 0) {
      for (const sel of attachedSelections) attachments.push({ type: 'selection', label: sel.source })
    }
    if (attachedImages.length > 0) {
      for (let i = 0; i < attachedImages.length; i++) attachments.push({ type: 'image', label: `图片 ${i + 1}` })
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim(), attachments: attachments.length > 0 ? attachments : undefined }
    setMessages((prev) => [...prev, userMsg])
    appendToDb(userMsg)
    setInput('')
    setIsStreaming(true)
    streamContentRef.current = ''
    setStreamContent('')

    // Unified intent detection: one AI call to classify graph/kanban/other
    if (vaultPath) {
      let detectedIntent = ''
      try {
        const intentResult = await window.api.invoke('ai:complete', {
          text: `判断用户指令的意图类型，只输出一个词：\n- "图谱" — 生成/索引知识图谱、建立关联关系\n- "看板" — 从笔记提取待办、创建看板任务、生成任务列表\n- "其他" — 以上都不是\n\n用户指令: "${userMsg.content}"`,
          temperature: 0
        })
        detectedIntent = (intentResult || '').trim()
      } catch {}

      if (detectedIntent.startsWith('图谱')) {
        let targetPath: string | null = null
        const files = await window.api.invoke('file:list-shallow', { dirPath: vaultPath })
        const dirs = files.filter((f: any) => f.isDirectory && !f.name.startsWith('.')).map((f: any) => f.name)
        try {
          const dirDetect = await window.api.invoke('ai:complete', {
            text: dirs.length > 0
              ? `用户指令: "${userMsg.content}"\n可用目录: ${dirs.join(', ')}\n\n请判断用户想对哪个目录生成知识图谱。如果用户提到了某个目录或主题与某个已有目录匹配，输出该目录名；如果用户说"当前"或没有指定，输出"当前"。只输出目录名或"当前"，不要其他文字。`
              : `用户指令: "${userMsg.content}"\n\n输出"当前"。`,
            temperature: 0
          })
          const detected = (dirDetect || '').trim().replace(/[\\/:*?"<>|"「」'']/g, '')
          if (detected && detected !== '当前' && detected.length < 30) {
            const exactMatch = dirs.find((d) => d.toLowerCase() === detected.toLowerCase())
            targetPath = `${vaultPath}/${exactMatch || detected}`
          }
        } catch {}

        if (!targetPath) {
          const fp = useEditorStore.getState().currentFilePath
          if (fp) {
            const parts = fp.replace(/\\/g, '/').split('/')
            parts.pop()
            targetPath = parts.join('/')
          } else {
            targetPath = vaultPath
          }
        }

        const msg: Message = { id: Date.now().toString(), role: 'assistant', content: '正在为该目录生成知识图谱...' }
        setMessages((msgs) => [...msgs, msg])
        appendToDb(msg)
        editCompleteRef.current = true
        setIsStreaming(false)
        window.dispatchEvent(new CustomEvent('index-and-show-graph', { detail: { path: targetPath, isDirectory: true } }))
        return
      }

      if (detectedIntent.startsWith('看板')) {
        const fp = useEditorStore.getState().currentFilePath
        if (!fp) {
          const msg: Message = { id: Date.now().toString(), role: 'assistant', content: '请先打开一篇笔记，再从当前笔记提取看板任务。' }
          setMessages((msgs) => [...msgs, msg])
          appendToDb(msg)
          editCompleteRef.current = true
          setIsStreaming(false)
          return
        }

        try {
          const content = useEditorStore.getState().content
          const result = await window.api.invoke('kanban:ai-from-note', { vaultPath, filePath: fp, content })
          const msg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `${result.summary || '已从当前笔记生成看板任务。'}\n\n已创建 ${result.tasks?.length || 0} 个任务、${result.relations?.length || 0} 个关系，并关联到当前笔记。`
          }
          setMessages((msgs) => [...msgs, msg])
          appendToDb(msg)
          toast('已生成看板任务', 'success')
        } catch (e: any) {
          const msg: Message = { id: Date.now().toString(), role: 'assistant', content: friendlyError(e.message || '') }
          setMessages((msgs) => [...msgs, msg])
          appendToDb(msg)
        }
        editCompleteRef.current = true
        setStreamContent('')
        setIsStreaming(false)
        return
      }
    }

    if (editMode) {
      const targetPath = editUnbound ? null : (editTarget || null)
      setEditElapsed(0)
      try {
        const isNewFile = !targetPath

        if (vaultPath) {
          // Unified edit-mode intent detection: one AI call
          const recentForDetect = messages.slice(-6).map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 150)}`).join('\n')
          let editIntent = '编辑'
          try {
            const intentResult = await window.api.invoke('ai:complete', {
              text: `判断用户在编辑模式下的意图，只输出一个词：\n- "对话" — 继续之前的对话、追问、闲聊\n- "批量" — 批量生成多篇笔记\n- "编辑" — 修改/创建单篇笔记\n\n${recentForDetect ? `最近对话：\n${recentForDetect}\n\n` : ''}用户指令: "${userMsg.content}"`,
              temperature: 0
            })
            editIntent = (intentResult || '').trim()
          } catch {}

          const isChatContinuation = editIntent.startsWith('对话')
          const isBatchRequest = editIntent.startsWith('批量')

          if (isChatContinuation) {
            editCompleteRef.current = true
            setIsStreaming(true)
            streamContentRef.current = ''
            setStreamContent('')
            const allMessages = [...messages, userMsg]
            const chatMessages = await buildChatMessages(allMessages)
            try {
              await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined } as any)
            } catch (e: any) {
              setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: friendlyError(e.message || '') }])
              streamContentRef.current = ''
              setStreamContent('')
              setIsStreaming(false)
            }
            return
          }

          if (isBatchRequest) {
          const files = await window.api.invoke('file:list-shallow', { dirPath: vaultPath })
          const dirs = files.filter((f: any) => f.isDirectory && !f.name.startsWith('.')).map((f: any) => f.name)

          // Build context from recent conversation for batch generation
          const recentContext = messages.slice(-10).map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 200)}`).join('\n')
          const batchInstruction = recentContext
            ? `对话上下文：\n${recentContext}\n\n当前指令: ${userMsg.content}`
            : userMsg.content

          // Use AI to semantically detect target directories from instruction (supports multiple)
          let specifiedDirs: string[] = []
          try {
            const detectResult = await window.api.invoke('ai:complete', {
              text: dirs.length > 0
                ? `用户指令: "${userMsg.content}"\n可用目录: ${dirs.join(', ')}\n\n请判断用户想把笔记放在哪些目录下。\n规则：\n- 如果用户明确提到目录名，用逗号分隔输出\n- 如果用户提到的主题与某个已有目录匹配，输出该目录名\n- 如果用户想创建新目录（不在列表中），输出用户提到的新目录名\n- 如果用户的意图隐含了多个分类/主题（如"五个不同前端框架"、"三种编程语言"），即使没有明确说目录名，也要根据语义推断出合理的目录名并输出\n- 只有当完全无法从指令中推断出任何目录归属时，才输出"空"\n只输出目录名（逗号分隔），不要其他文字。`
                : `用户指令: "${userMsg.content}"\n\n请从用户指令中判断目标目录名。\n规则：\n- 如果用户明确提到目录名，用逗号分隔输出\n- 如果用户的意图隐含了多个分类/主题（如"五个不同前端框架"、"三种编程语言"、"不同领域"），即使没有明确说目录名，也要根据语义推断出合理的具体目录名并输出\n- 只有当完全无法从指令中推断出任何目录归属时，才输出"空"\n只输出目录名（逗号分隔），不要其他文字。`
            })
            const raw = (detectResult || '').trim()
            if (raw && raw !== '空') {
              const parts = raw.split(/[,，、]/).map((s: string) => s.trim().replace(/[\\/:*?"<>|"「」'']/g, '')).filter((s: string) => s && s !== '空' && s.length < 30)
              for (const part of parts) {
                const exactMatch = dirs.find((d: string) => d.toLowerCase() === part.toLowerCase())
                specifiedDirs.push(exactMatch || part)
              }
            }
          } catch {}

          if (specifiedDirs.length > 1) {
            if (editTimerRef.current) clearInterval(editTimerRef.current)
            editTimerRef.current = null
            for (const dir of specifiedDirs) {
              const perDirInstruction = `${batchInstruction}\n\n注意：本次只生成与「${dir}」主题相关的笔记，放到「${dir}」目录下。`
              await executeBatchGenerate(perDirInstruction, `${vaultPath}/${dir}`)
            }
          } else if (specifiedDirs.length === 1) {
            if (editTimerRef.current) clearInterval(editTimerRef.current)
            editTimerRef.current = null
            await executeBatchGenerate(batchInstruction, `${vaultPath}/${specifiedDirs[0]}`)
          } else {
            setFolderOptions(dirs)
            setPendingBatch({ instruction: batchInstruction })
            setIsStreaming(false)
            if (editTimerRef.current) clearInterval(editTimerRef.current)
            editTimerRef.current = null
            const askMsg: Message = { id: Date.now().toString(), role: 'assistant', content: '请选择笔记存放目录：' }
            setMessages((msgs) => [...msgs, askMsg])
          }
          return
          }
        }

        let fileContent = ''
        let filePath = targetPath || (editUnbound ? '' : currentFilePath) || ''
        if (filePath) {
          fileContent = await window.api.invoke('file:read', { path: filePath })
        }

        editTimerRef.current = setInterval(() => setEditElapsed((t) => t + 1), 1000)
        const result = await window.api.invoke('ai:edit', {
          instruction: !filePath
            ? `创建一篇新笔记。要求：${userMsg.content}`
            : userMsg.content,
          fileContent,
          filePath: filePath || '(新文件)',
          images: attachedImages.length > 0 ? attachedImages : undefined,
          history: editHistory.length > 0 ? editHistory : undefined
        } as any)
        setAttachedImages([])
        if (result.success && result.content) {
          setEditHistory((prev) => [...prev, userMsg.content])
          if (!filePath && vaultPath) {
            const titleMatch = result.content.match(/^#\s+(.+)$/m)
            const title = titleMatch ? titleMatch[1].trim().replace(/[\\/:*?"<>|]/g, '') : '新笔记'
            const newPath = `${vaultPath}/${title}.md`
            await window.api.invoke('file:create', { path: newPath, content: result.content, vaultPath })
            useEditorStore.getState().openFile(newPath)
            const msg: Message = { id: Date.now().toString(), role: 'assistant', content: `已创建笔记「${title}」并打开。` }
            setMessages((msgs) => [...msgs, msg])
            appendToDb(msg)
          } else {
            setEditResult({ content: result.content, filePath: filePath })
            setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: '已生成修改方案，请查看下方预览并确认应用。' }])
          }
        } else {
          setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: `编辑失败: ${result.error}` }])
        }
      } catch (e: any) {
        setMessages((msgs) => [...msgs, { id: Date.now().toString(), role: 'assistant', content: friendlyError(e.message || '') }])
      }
      if (editTimerRef.current) clearInterval(editTimerRef.current)
      editTimerRef.current = null
      editCompleteRef.current = true
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
    const chatMessages = await buildChatMessages(allMessages)
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
      if (agentMode && vaultPath) {
        await window.api.invoke('ai:chat-agent', { messages: chatMessages, vaultPath } as any)
      } else {
        await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined } as any)
      }
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
        window.dispatchEvent(new CustomEvent('editor-apply-content', { detail: { content: editResult.content } }))
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
    if (vaultPath) window.api.invoke('db:chat-history-clear', { vaultPath, sessionId: currentSessionId || undefined }).catch(() => {})
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
    await window.api.invoke('file:create', { path, content, vaultPath })
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

      // Check for internal file tree drag (custom MIME type)
      const nexuskyPath = e.dataTransfer?.getData('application/x-nexusky-path') || ''
      const text = nexuskyPath || e.dataTransfer?.getData('text/plain') || ''

      if (text) {
        if (text.endsWith('.md')) {
          const title = text.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '笔记'
          setAttachedNotes((prev) => prev.some((n) => n.filePath === text) ? prev : [...prev, { title, filePath: text }])
          return
        }
        // Folder path — list .md files inside
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
        if (!nexuskyPath && text.length >= 3) {
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
      <div style={{ padding: '0 10px 0 14px', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setShowSessions(!showSessions)}
            style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            title="会话列表"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            {sessions.length > 0 && <span>{sessions.length}</span>}
          </button>
          <button
            onClick={handleNewSession}
            style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-text)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
            title="新建会话"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
      </div>

      {/* Session list panel */}
      {showSessions && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)', maxHeight: 200, overflowY: 'auto', flexShrink: 0 }}>
          <button
            onClick={() => handleSwitchSession(null)}
            style={{ width: '100%', height: 30, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: !currentSessionId ? 'var(--accent-text)' : 'var(--text-secondary)', background: !currentSessionId ? 'var(--accent-muted)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            默认对话
          </button>
          {sessions.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', height: 30, padding: '0 14px', background: s.id === currentSessionId ? 'var(--accent-muted)' : 'transparent' }}>
              <button
                onClick={() => handleSwitchSession(s.id)}
                style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', fontSize: 12, color: s.id === currentSessionId ? 'var(--accent-text)' : 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {s.title}
              </button>
              <button
                onClick={() => handleDeleteSession(s.id)}
                style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 3, flexShrink: 0 }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <ChatMessages
        messages={messages}
        isStreaming={isStreaming}
        streamContent={streamContent}
        editMode={editMode}
        editElapsed={editElapsed}
        toolStatus={toolStatus}
        onRegenerate={handleRegenerate}
      />

      {/* Folder picker for batch generation */}
      {pendingBatch && folderOptions.length >= 0 && (
        <div style={{ padding: '8px 14px', flexShrink: 0 }}>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--accent-muted)', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>选择存放目录：</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {folderOptions.map((dir) => (
                <button
                  key={dir}
                  onClick={() => handleSelectFolder(dir)}
                  style={{ height: 28, padding: '0 12px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 100ms' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-muted)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
                >
                  {dir}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                autoFocus
                placeholder="输入新目录名..."
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) handleSelectFolder((e.target as HTMLInputElement).value.trim()) }}
                style={{ flex: 1, height: 30, padding: '0 10px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none' }}
              />
              <button
                onClick={(e) => {
                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
                  if (input.value.trim()) handleSelectFolder(input.value.trim())
                }}
                style={{ height: 30, padding: '0 12px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }}
              >
                新建目录
              </button>
              <button
                onClick={() => { setPendingBatch(null); setFolderOptions([]) }}
                style={{ height: 30, padding: '0 10px', fontSize: 12, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

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
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 10,
          transition: 'border-color 150ms, box-shadow 150ms',
          overflow: 'hidden',
        }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,110,240,0.08)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none' }}
        >
          {/* Edit target indicator */}
          {editMode && (
            <div style={{ padding: '6px 12px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              <span style={{ fontSize: 11, color: 'var(--accent-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {editTarget
                  ? editTarget.split(/[\\/]/).pop()?.replace(/\.md$/, '')
                  : editUnbound
                    ? '无目标文件（生成新笔记）'
                    : (currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '无目标文件（生成新笔记）')}
              </span>
              {(editTarget || (!editUnbound && currentFilePath)) && (
                <button onClick={() => { setEditTarget(null); setEditUnbound(true) }} style={{ width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, flexShrink: 0 }} title="取消绑定，切换为生成新文件">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
              {editUnbound && !editTarget && currentFilePath && (
                <button onClick={() => setEditUnbound(false)} style={{ fontSize: 10, padding: '1px 6px', border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 3 }} title="重新绑定当前文件">
                  绑定当前
                </button>
              )}
            </div>
          )}

          {/* Attached items inside input box */}
          {(attachedNotes.length > 0 || attachedSelections.length > 0 || attachedImages.length > 0) && (
            <div style={{ padding: '8px 12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attachedImages.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {attachedImages.map((img, i) => (
                    <div key={i} style={{ position: 'relative', width: 40, height: 40, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                      <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 1, right: 1, width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9999, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 7, padding: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {attachedNotes.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
              {attachedSelections.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {attachedSelections.map((sel, i) => (
                    <div key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{sel.source}:</span> {sel.text.slice(0, 60)}{sel.text.length > 60 ? '...' : ''}
                      </span>
                      <button onClick={() => setAttachedSelections((prev) => prev.filter((_, j) => j !== i))} style={{ width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
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
              placeholder={editMode ? (currentFilePath || editTarget ? '描述你想要的修改...' : '描述要生成的笔记内容...') : '提问，或 @ 引用笔记'}
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
                onClick={() => { window.api.invoke('ai:stop', undefined); isStreamingRef.current = false; streamContentRef.current = ''; setIsStreaming(false); setStreamContent(''); setToolStatus(null) }}
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
          <div style={{ padding: '4px 10px 8px', display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => { updateEditMode(!editMode); setEditTarget(null); setEditHistory([]); setEditUnbound(false) }}
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
            {!editMode && (
              <button
                onClick={() => updateAgentMode(!agentMode)}
                style={{
                  height: 22, padding: '0 8px', fontSize: 11, fontWeight: 500, borderRadius: 5, cursor: 'pointer',
                  background: agentMode ? 'var(--accent-muted)' : 'transparent',
                  color: agentMode ? 'var(--accent-text)' : 'var(--text-tertiary)',
                  border: 'none',
                  transition: 'all 100ms',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
                title={agentMode ? 'Agent 模式：AI 可搜索/读取/创建/编辑笔记' : '普通模式：仅对话'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                Agent
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', opacity: 0.5 }}>Enter 发送</span>
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
