import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import { ConfirmModal } from '../ConfirmModal'
import { ChatMessages } from './ChatMessages'
import { DiffView } from './DiffView'
import { renderMarkdown } from './MessageBubble'
import { formatAiToolStatus } from './tool-labels'
import { getChatDraftStorageKey, normalizeChatDraft } from './chat-draft'
import { buildChatSessionTitleFromPrompt, shouldAutoRenameChatSession } from './chat-session-title'
import { buildDocumentAttachmentContext, createDocumentAttachment, createDocumentAttachmentFromExtracted, isSupportedAiDocumentName, type AiDocumentAttachment } from './document-attachment'
import { createEditableBatchPlanItem, MAX_EDITABLE_BATCH_NOTE_COUNT, normalizeEditableBatchCount, normalizeEditableBatchPlan } from './batch-plan'
import { stopPendingBatchPlanContent } from './batch-progress'
import { getErrorMessage, isCancellationError } from '../../utils/errors'
import { safeGet, safeRemove, safeSet } from '../../utils/storage'
import type { Message } from './MessageBubble'
import type { ChatContentPart, ChatSource, GeneratedNoteBatchPlanItem, IPCChatMessage } from '@shared/types/ipc'

interface FileEntry { name: string; path: string; isDirectory: boolean; children?: FileEntry[] }
type FileWithPath = File & { path?: string }
type BatchPlanItem = { title: string; done: boolean }
type SharedBatchPlan = { id: string; items: BatchPlanItem[] }
type PendingBatchPlan = { instruction: string; batches: GeneratedNoteBatchPlanItem[] }

interface AICommandDraft {
  prompt: string
  mode?: 'chat' | 'edit'
  agentMode?: boolean
  attachSelection?: boolean
  unboundEdit?: boolean
  requiresCurrentNote?: boolean
}

const MAX_ATTACHED_NOTES = 20
const MAX_ATTACHED_SELECTIONS = 8
const MAX_ATTACHED_IMAGES = 4
const MAX_ATTACHED_DOCUMENTS = 8
const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000
const MAX_ATTACHMENT_CONTEXT_CHARS = 60_000
const SELECTION_CHAR_LIMIT = 2000

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

function estimateTokens(text: string): number {
  let cjk = 0, other = 0
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF)) {
      cjk++
    } else {
      other++
    }
  }
  return cjk + Math.ceil(other / 4)
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const pendingSourcesRef = useRef<ChatSource[]>([])
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
    return safeGet('nexusky-agent-mode') !== '0'
  })
  const updateAgentMode = (v: boolean) => {
    setAgentMode(v)
    safeSet('nexusky-agent-mode', v ? '1' : '0')
  }

  // Multi-session state
  const [sessions, setSessions] = useState<{ id: string; title: string; createdAt: number; updatedAt: number }[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    return safeGet('nexusky-chat-session-id')
  })
  const updateSessionId = (id: string | null) => {
    setCurrentSessionId(id)
    if (id) safeSet('nexusky-chat-session-id', id)
    else safeRemove('nexusky-chat-session-id')
  }
  const [showSessions, setShowSessions] = useState(false)
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<{ title: string; filePath: string }[]>([])
  const [attachedNotes, setAttachedNotes] = useState<{ title: string; filePath: string }[]>([])
  const [attachedSelections, setAttachedSelections] = useState<{ text: string; source: string }[]>([])
  const [editMode, setEditMode] = useState(() => {
    return safeGet('nexusky-chat-edit-mode') === '1'
  })
  const updateEditMode = (v: boolean) => {
    setEditMode(v)
    safeSet('nexusky-chat-edit-mode', v ? '1' : '0')
  }
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editResult, setEditResult] = useState<{ content: string; original: string; filePath: string } | null>(null)
  const [editHistory, setEditHistory] = useState<string[]>([])
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [attachedDocuments, setAttachedDocuments] = useState<AiDocumentAttachment[]>([])
  const [editPreviewExpanded, setEditPreviewExpanded] = useState(false)
  const [editPreviewMode, setEditPreviewMode] = useState<'diff' | 'preview'>('diff')
  const [editElapsed, setEditElapsed] = useState(0)
  const [editStreamContent, setEditStreamContent] = useState('')
  const editTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const restoringDraftRef = useRef(false)
  const batchCancelledRef = useRef(false)
  const activeBatchPlanMsgIdsRef = useRef<Set<string>>(new Set())
  const [pendingBatch, setPendingBatch] = useState<{ instruction: string } | null>(null)
  const [pendingBatchPlan, setPendingBatchPlan] = useState<PendingBatchPlan | null>(null)
  const [folderOptions, setFolderOptions] = useState<string[]>([])
  const [editUnbound, setEditUnbound] = useState(false)
  const draftStorageKey = useMemo(() => getChatDraftStorageKey(vaultPath, currentSessionId), [vaultPath, currentSessionId])

  const tokenCount = useMemo(() => {
    let total = 0
    for (const msg of messages) {
      total += estimateTokens(msg.content)
    }
    return total
  }, [messages])

  useEffect(() => {
    if (!vaultPath) return
    window.api.invoke('db:chat-sessions-list', { vaultPath }).then(setSessions).catch(() => {})
    window.api.invoke('db:chat-history-load', { vaultPath, sessionId: currentSessionId || undefined }).then((rows) => {
      if (rows && rows.length > 0) {
        setMessages(rows.map((r) => ({ id: r.id, role: r.role, content: r.content, sources: r.sources })))
      } else {
        setMessages([])
      }
    }).catch(() => {})
  }, [vaultPath, currentSessionId])

  const appendToDb = useCallback((msg: Message) => {
    if (!vaultPath) return
    window.api.invoke('db:chat-history-append', { vaultPath, role: msg.role, content: msg.content, sources: msg.sources, sessionId: currentSessionId || undefined }).catch(() => {})
  }, [vaultPath, currentSessionId])

  const rewriteDbHistory = useCallback(async (nextMessages: Message[]) => {
    if (!vaultPath) return
    await window.api.invoke('db:chat-history-clear', { vaultPath, sessionId: currentSessionId || undefined })
    for (const msg of nextMessages) {
      await window.api.invoke('db:chat-history-append', { vaultPath, role: msg.role, content: msg.content, sources: msg.sources, sessionId: currentSessionId || undefined })
    }
  }, [vaultPath, currentSessionId])

  const appendAssistantMessage = useCallback((content: string, sources?: ChatSource[]) => {
    const msg: Message = { id: Date.now().toString(), role: 'assistant', content, sources }
    setMessages((msgs) => [...msgs, msg])
    appendToDb(msg)
    return msg
  }, [appendToDb])

  const addAttachedNote = useCallback((note: { title: string; filePath: string }) => {
    setAttachedNotes((prev) => {
      if (prev.some((n) => n.filePath === note.filePath)) return prev
      if (prev.length >= MAX_ATTACHED_NOTES) {
        toast(`最多一次引用 ${MAX_ATTACHED_NOTES} 篇笔记`, 'info')
        return prev
      }
      return [...prev, note]
    })
  }, [])

  const addAttachedDocument = useCallback((document: AiDocumentAttachment) => {
    setAttachedDocuments((prev) => {
      const key = document.path || document.name
      if (prev.some((item) => (item.path || item.name) === key)) return prev
      if (prev.length >= MAX_ATTACHED_DOCUMENTS) {
        toast(`最多一次引用 ${MAX_ATTACHED_DOCUMENTS} 个文档`, 'info')
        return prev
      }
      return [...prev, document]
    })
  }, [])

  const attachDocumentFromPath = useCallback(async (path: string): Promise<boolean> => {
    if (!isSupportedAiDocumentName(path)) return false
    const name = path.split(/[\\/]/).pop() || path
    try {
      const extracted = await window.api.invoke('file:extract-document-text', { path })
      addAttachedDocument(createDocumentAttachmentFromExtracted(extracted))
      return true
    } catch {
      toast(`无法读取文档：${name}`, 'error')
      return true
    }
  }, [addAttachedDocument])

  const attachDocumentFromFile = useCallback(async (file: FileWithPath): Promise<boolean> => {
    if (!isSupportedAiDocumentName(file.name)) return false
    try {
      if (file.path) {
        const extracted = await window.api.invoke('file:extract-document-text', { path: file.path })
        addAttachedDocument(createDocumentAttachmentFromExtracted(extracted))
      } else {
        addAttachedDocument(createDocumentAttachment(file.name, await file.text()))
      }
    } catch {
      toast(`无法读取文档：${file.name}`, 'error')
    }
    return true
  }, [addAttachedDocument])

  const attachImageFile = useCallback((file: File): boolean => {
    if (!file.type.startsWith('image/')) return false
    if (attachedImages.length >= MAX_ATTACHED_IMAGES) {
      toast(`最多一次粘贴 ${MAX_ATTACHED_IMAGES} 张图片`, 'info')
      return true
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (!reader.result) return
      const dataUrl = reader.result as string
      if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
        toast('图片过大，未添加到 AI 上下文', 'error')
        return
      }
      setAttachedImages((prev) => {
        if (prev.length >= MAX_ATTACHED_IMAGES) {
          toast(`最多一次粘贴 ${MAX_ATTACHED_IMAGES} 张图片`, 'info')
          return prev
        }
        return [...prev, dataUrl]
      })
    }
    reader.readAsDataURL(file)
    return true
  }, [attachedImages.length])

  const attachFileForAi = useCallback(async (file: FileWithPath): Promise<boolean> => {
    if (attachImageFile(file)) return true
    if (file.name.endsWith('.md') && file.path) {
      addAttachedNote({ title: file.name.replace(/\.md$/, ''), filePath: file.path })
      return true
    }
    return attachDocumentFromFile(file)
  }, [addAttachedNote, attachDocumentFromFile, attachImageFile])

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

  const renameCurrentSessionFromPrompt = useCallback((prompt: string, messageCount: number) => {
    if (!vaultPath || !currentSessionId) return
    const currentSession = sessions.find((session) => session.id === currentSessionId)
    if (!shouldAutoRenameChatSession(currentSession?.title, messageCount)) return
    const title = buildChatSessionTitleFromPrompt(prompt)
    setSessions((prev) => prev.map((session) => session.id === currentSessionId ? { ...session, title, updatedAt: Date.now() / 1000 } : session))
    window.api.invoke('db:chat-session-rename', { vaultPath, sessionId: currentSessionId, title }).catch(() => {})
  }, [currentSessionId, sessions, vaultPath])

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
        if (streamContentRef.current) {
          const partial = streamContentRef.current
          const errMsg = friendlyError(event.content)
          const partialMsg: Message = { id: Date.now().toString(), role: 'assistant', content: partial }
          const errorMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: `⚠️ ${errMsg}` }
          setMessages((msgs) => [...msgs, partialMsg, errorMsg])
          appendToDb(partialMsg)
          appendToDb(errorMsg)
        } else {
          const errorMsg: Message = { id: Date.now().toString(), role: 'assistant', content: friendlyError(event.content) }
          setMessages((msgs) => [...msgs, errorMsg])
          appendToDb(errorMsg)
        }
        streamContentRef.current = ''
        setStreamContent('')
        setIsStreaming(false)
      } else if (event.type === 'retry') {
        setToolStatus(event.content)
      } else if (event.type === 'tool_call') {
        try {
          const data = JSON.parse(event.content)
          setToolStatus(formatAiToolStatus(data.name, data.args))
        } catch {
          setToolStatus('调用工具...')
        }
      }
    }
    const cleanup = window.api.onAiStream(handler)
    return () => { cleanup() }
  }, [appendToDb])

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
    const cleanup = window.api.onAiEditStream((event: { type: string; content?: string }) => {
      if (event.type === 'text' && event.content) {
        setEditStreamContent((prev) => prev + event.content)
      } else if (event.type === 'done') {
        setEditStreamContent('')
      }
    })
    return () => { cleanup() }
  }, [])

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
    const remaining = messages.slice(0, msgIndex)
    setMessages(remaining)
    if (vaultPath) {
      await rewriteDbHistory(remaining)
    }

    const providers = await window.api.invoke('ai:get-providers', undefined)
    if (!providers || providers.length === 0 || !providers.some((p) => p.enabled)) {
      toast('请先在设置中配置 AI 提供商', 'error')
      return
    }

    setIsStreaming(true)
    streamContentRef.current = ''
    setStreamContent('')

    const chatMessages = await buildChatMessages(remaining)
    try {
      if (agentMode && vaultPath) {
        await window.api.invoke('ai:chat-agent', { messages: chatMessages, vaultPath, currentFilePath })
      } else {
        await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined })
      }
    } catch (e: unknown) {
      appendAssistantMessage(friendlyError(getErrorMessage(e)))
      streamContentRef.current = ''
      setStreamContent('')
      setIsStreaming(false)
    }
  }, [messages, isStreaming, vaultPath, rewriteDbHistory, agentMode, currentFilePath, appendAssistantMessage])

  const handleContinue = useCallback(async (msg: Message) => {
    if (isStreaming) return
    const msgIndex = messages.findIndex((m) => m.id === msg.id)
    if (msgIndex < 0) return

    // Remove both the partial message and the error message after it
    const remaining = messages.filter((_, i) => i !== msgIndex && i !== msgIndex + 1)
    setMessages(remaining)
    if (vaultPath) {
      await rewriteDbHistory(remaining)
    }

    const providers = await window.api.invoke('ai:get-providers', undefined)
    if (!providers || providers.length === 0 || !providers.some((p) => p.enabled)) {
      toast('请先在设置中配置 AI 提供商', 'error')
      return
    }

    // Seed stream with partial content so continuation appends to it
    setIsStreaming(true)
    streamContentRef.current = msg.content
    setStreamContent(msg.content)

    const chatMessages = await buildChatMessages(remaining)
    chatMessages.push({ role: 'assistant', content: msg.content })
    try {
      if (agentMode && vaultPath) {
        await window.api.invoke('ai:chat-agent', { messages: chatMessages, vaultPath, currentFilePath })
      } else {
        await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined })
      }
    } catch (e: unknown) {
      appendAssistantMessage(friendlyError(getErrorMessage(e)))
      streamContentRef.current = ''
      setStreamContent('')
      setIsStreaming(false)
    }
  }, [messages, isStreaming, vaultPath, rewriteDbHistory, agentMode, currentFilePath, appendAssistantMessage])

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
      addAttachedNote(note)
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
    setAttachedSelections((prev) => {
      if (prev.length >= MAX_ATTACHED_SELECTIONS) {
        toast(`最多一次引用 ${MAX_ATTACHED_SELECTIONS} 段选中文本`, 'info')
        return prev
      }
      return [...prev, { text: sel.slice(0, SELECTION_CHAR_LIMIT), source }]
    })
    inputRef.current?.focus()
  }

  const applyCommandDraft = useCallback((draft: AICommandDraft) => {
    if (draft.requiresCurrentNote && !currentFilePath) {
      toast('请先打开一篇笔记', 'info')
      return
    }
    if (draft.mode === 'edit') {
      updateEditMode(true)
      setEditTarget(null)
      setEditUnbound(Boolean(draft.unboundEdit))
    } else if (draft.mode === 'chat') {
      updateEditMode(false)
      setEditUnbound(false)
      setEditTarget(null)
    }
    if (typeof draft.agentMode === 'boolean') updateAgentMode(draft.agentMode)
    if (draft.attachSelection) {
      const sel = window.getSelection()?.toString()
      if (sel && sel.length >= 3) {
        const source = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '选中文本'
        setAttachedSelections((prev) => {
          if (prev.length >= MAX_ATTACHED_SELECTIONS) return prev
          return [...prev, { text: sel.slice(0, SELECTION_CHAR_LIMIT), source }]
        })
      } else {
        toast('请先在编辑器中选中一段文本', 'info')
      }
    }
    setInput(draft.prompt)
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [currentFilePath])

  useEffect(() => {
    restoringDraftRef.current = true
    setInput(normalizeChatDraft(safeGet(draftStorageKey)))
    setShowMention(false)
    setMentionQuery('')
  }, [draftStorageKey])

  useEffect(() => {
    if (restoringDraftRef.current) {
      restoringDraftRef.current = false
      return
    }
    const draft = normalizeChatDraft(input)
    if (draft.trim()) safeSet(draftStorageKey, draft)
    else safeRemove(draftStorageKey)
  }, [draftStorageKey, input])

  useEffect(() => {
    const pending = safeGet('nexusky-pending-ai-draft')
    if (pending) {
      safeRemove('nexusky-pending-ai-draft')
      try {
        applyCommandDraft(JSON.parse(pending) as AICommandDraft)
      } catch {}
    }
    const handler = (e: Event) => {
      safeRemove('nexusky-pending-ai-draft')
      applyCommandDraft((e as CustomEvent<AICommandDraft>).detail)
    }
    window.addEventListener('ai-command-draft', handler)
    return () => window.removeEventListener('ai-command-draft', handler)
  }, [applyCommandDraft])

  const TOKEN_THRESHOLD = 12
  const RECENT_KEEP = 6

  const getCurrentNoteContextMessage = (): IPCChatMessage | null => {
    if (!currentFilePath) return null
    const title = currentFilePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || currentFilePath
    return {
      role: 'system',
      content: `当前打开笔记: ${title}\n路径: ${currentFilePath}\n当用户提到“当前笔记”“这篇笔记”或“这里”时，优先指这篇笔记；需要读取内容时可用 read_note 并传入该路径。`
    }
  }

  const buildChatMessages = async (allMessages: Message[]): Promise<IPCChatMessage[]> => {
    const currentNoteContext = getCurrentNoteContextMessage()
    if (allMessages.length <= TOKEN_THRESHOLD) {
      return [
        ...(currentNoteContext ? [currentNoteContext] : []),
        ...allMessages.map((m) => ({ role: m.role, content: m.content }))
      ]
    }

    const recentMessages = allMessages.slice(-RECENT_KEEP)
    const oldMessages = allMessages.slice(0, -RECENT_KEEP)
    const oldCount = oldMessages.length

    // Cache hit: if we already summarized this many old messages, reuse the summary
    // Only regenerate when new messages have rolled into the "old" window
    if (contextSummaryRef.current && summarizedCountRef.current === oldCount) {
      return [
        ...(currentNoteContext ? [currentNoteContext] : []),
        { role: 'system', content: `Below is a summary of the prior conversation. Continue based on this context:\n${contextSummaryRef.current}` },
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
          system: `Merge the existing summary with new messages into an updated summary. 3-5 sentences, output only the summary text.

<priority>
Retain information by priority (high to low):
1. User's unfinished intents or pending requests
2. Key decisions and constraints (e.g., specified directory, filename, tech choices)
3. AI's completed actions (what was generated, what was modified)
4. Discussed but resolved issues (mention briefly)
</priority>

Discard: greetings, repeated confirmations, old plans superseded by later decisions.`,
          text: `Existing summary:\n${contextSummaryRef.current}\n\nNew messages:\n${newOldMessages.map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 300)}`).join('\n')}`
        })
      } catch {
        summary = contextSummaryRef.current
      }
    } else {
      // Full summarization: first time or too many new messages
      try {
        summary = await window.api.invoke('ai:complete', {
          system: `Compress conversation history into a summary. 3-5 sentences, output only the summary text.

<priority>
Retain information by priority (high to low):
1. User's unfinished intents or pending requests
2. Key decisions and constraints (e.g., specified directory, filename, tech choices)
3. AI's completed actions (what was generated, what was modified)
4. Discussed but resolved issues (mention briefly)
</priority>

Discard: greetings, repeated confirmations, old plans superseded by later decisions.`,
          text: oldMessages.map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 300)}`).join('\n')
        })
      } catch {
        summary = oldMessages.map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 80)}`).join('\n')
      }
    }

    if (summary) {
      contextSummaryRef.current = summary
      summarizedCountRef.current = oldCount
    }

    return [
      ...(currentNoteContext ? [currentNoteContext] : []),
      { role: 'system', content: `Below is a summary of the prior conversation. Continue based on this context:\n${summary}` },
      ...recentMessages.map((m) => ({ role: m.role, content: m.content }))
    ]
  }

  const stopGeneration = useCallback(() => {
    batchCancelledRef.current = true
    const activePlanIds = activeBatchPlanMsgIdsRef.current
    if (activePlanIds.size > 0) {
      setMessages((msgs) => msgs.map((msg) => (
        activePlanIds.has(msg.id) ? { ...msg, content: stopPendingBatchPlanContent(msg.content) } : msg
      )))
    }
    window.api.invoke('ai:stop', undefined).catch(() => {})
    isStreamingRef.current = false
    setIsStreaming(false)
    setToolStatus(null)
  }, [])

  const executeBatchGenerate = async (
    instruction: string,
    targetDir: string,
    options: { label?: string; silentSummary?: boolean; sharedPlan?: SharedBatchPlan; suppressResultMessage?: boolean; openFirstFile?: boolean } = {}
  ): Promise<{ success: boolean; error?: string; files: string[] }> => {
    setIsStreaming(true)
    streamContentRef.current = ''
    setStreamContent('')
    setEditElapsed(0)
    if (editTimerRef.current) clearInterval(editTimerRef.current)
    editTimerRef.current = setInterval(() => setEditElapsed((t) => t + 1), 1000)

    const planMsgId = options.sharedPlan?.id || Date.now().toString()
    let planItems: BatchPlanItem[] = []
    let planItemIndexes: number[] = []

    const updatePlanMsg = () => {
      const visibleItems = options.sharedPlan?.items || planItems
      const lines = visibleItems.map((item) => `${item.done ? '✓' : '○'} ${item.title}`).join('\n')
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
        setStreamContent(options.label ? `正在规划「${options.label}」笔记结构...` : '正在规划笔记结构...')
      } else if (data.stage === 'planned' && data.plan) {
        if (batchCancelledRef.current) {
          setStreamContent('')
          return
        }
        planItems = data.plan.map((p) => ({ title: options.label ? `${options.label} / ${p.title}` : p.title, done: false }))
        if (options.sharedPlan) {
          const startIndex = options.sharedPlan.items.length
          options.sharedPlan.items.push(...planItems)
          planItemIndexes = planItems.map((_, index) => startIndex + index)
        }
        setStreamContent('')
        if (options.sharedPlan) {
          updatePlanMsg()
        } else {
          const lines = planItems.map((item) => `○ ${item.title}`).join('\n')
          activeBatchPlanMsgIdsRef.current.add(planMsgId)
          setMessages((msgs) => [...msgs, { id: planMsgId, role: 'assistant', content: lines }])
        }
      } else if (data.stage === 'generating' && data.current) {
        if (batchCancelledRef.current) return
        if (data.current > 1) {
          if (options.sharedPlan && planItemIndexes[data.current - 2] !== undefined) {
            const index = planItemIndexes[data.current - 2]
            options.sharedPlan.items[index] = { ...options.sharedPlan.items[index], done: true }
          } else {
            planItems[data.current - 2] = { ...planItems[data.current - 2], done: true }
          }
        }
        updatePlanMsg()
      } else if (data.stage === 'indexing') {
        if (batchCancelledRef.current) {
          setStreamContent('')
          return
        }
        if (options.sharedPlan && planItemIndexes.length > 0) {
          for (const index of planItemIndexes) {
            options.sharedPlan.items[index] = { ...options.sharedPlan.items[index], done: true }
          }
        } else {
          planItems = planItems.map((item) => ({ ...item, done: true }))
        }
        updatePlanMsg()
        setStreamContent('正在索引笔记关系...')
      } else if (data.stage === 'index-error') {
        setStreamContent('')
        appendAssistantMessage(`⚠️ ${data.message}（文件已生成，但知识图谱索引失败，可手动重建索引）`)
      } else if (data.stage === 'done') {
        setStreamContent('')
      }
    })

    let result: { success: boolean; error?: string; files: string[] }
    try {
      result = await window.api.invoke('ai:generate-notes', { instruction, vaultPath: vaultPath!, targetDir })
    } catch (e: unknown) {
      result = { success: false, error: friendlyError(getErrorMessage(e)), files: [] }
    } finally {
      cleanup()
    }

    if (result.success && !batchCancelledRef.current) {
      if (options.sharedPlan && planItemIndexes.length > 0) {
        for (const index of planItemIndexes) {
          options.sharedPlan.items[index] = { ...options.sharedPlan.items[index], done: true }
        }
      } else {
        planItems = planItems.map((item) => ({ ...item, done: true }))
      }
      updatePlanMsg()
    }

    if (result.success && !batchCancelledRef.current && result.files.length > 0) {
      await useVaultStore.getState().refreshFiles()
      if (options.openFirstFile !== false) {
        await useEditorStore.getState().openFile(result.files[0])
      }
      const dirName = targetDir.split(/[\\/]/).pop()
      if (!options.silentSummary && !options.suppressResultMessage) {
        const msg: Message = { id: Date.now().toString(), role: 'assistant', content: `已在「${dirName}」下生成 ${result.files.length} 个文件。` }
        setMessages((msgs) => [...msgs, msg])
        appendToDb(msg)
      }
    } else if (result.files.length > 0) {
      await useVaultStore.getState().refreshFiles()
      if (!options.suppressResultMessage) appendAssistantMessage(`已停止，生成了 ${result.files.length} 个文件。`)
    } else if (batchCancelledRef.current || result.error === '已取消') {
      if (!options.suppressResultMessage) appendAssistantMessage('已停止，未生成新文件。')
    } else {
      if (!options.suppressResultMessage) appendAssistantMessage(`生成失败: ${result.error || '未知错误'}`)
    }
    setStreamContent('')
    setToolStatus(null)
    if (editTimerRef.current) clearInterval(editTimerRef.current)
    editTimerRef.current = null
    editCompleteRef.current = true
    setIsStreaming(false)
    setPendingBatch(null)
    setPendingBatchPlan(null)
    setFolderOptions([])
    if (!options.sharedPlan) activeBatchPlanMsgIdsRef.current.delete(planMsgId)
    return result
  }

  const executeBatchPlan = async (batchInstruction: string, batches: GeneratedNoteBatchPlanItem[]) => {
    if (!vaultPath || batches.length === 0) return
    if (editTimerRef.current) clearInterval(editTimerRef.current)
    editTimerRef.current = null
    batchCancelledRef.current = false

    const sharedPlan: SharedBatchPlan = { id: Date.now().toString(), items: [] }
    activeBatchPlanMsgIdsRef.current.add(sharedPlan.id)
    setMessages((msgs) => [...msgs, { id: sharedPlan.id, role: 'assistant', content: '○ 正在规划批量笔记...' }])

    const completedBatches: { dir: string; count: number }[] = []
    let firstGeneratedFile: string | null = null
    let batchError: string | null = null

    for (const batch of batches) {
      if (batchCancelledRef.current) break
      const perDirInstruction = `${batchInstruction}\n\n批量目录规划：本次只生成「${batch.topic}」主题，放到「${batch.dir}」目录下。请生成 ${batch.count} 篇独立 Markdown 笔记。`
      const result = await executeBatchGenerate(perDirInstruction, `${vaultPath}/${batch.dir}`, { label: batch.dir, silentSummary: true, sharedPlan, suppressResultMessage: true, openFirstFile: false })
      if (result.files.length > 0) {
        if (!firstGeneratedFile) firstGeneratedFile = result.files[0]
        completedBatches.push({ dir: batch.dir, count: result.files.length })
      }
      if (!result.success) {
        batchError = result.error || '未知错误'
        break
      }
      if (batchCancelledRef.current) break
    }

    if (batchCancelledRef.current) {
      const totalFiles = completedBatches.reduce((sum, batch) => sum + batch.count, 0)
      appendAssistantMessage(totalFiles > 0 ? `已停止，已生成 ${totalFiles} 个文件。` : '已停止，未生成新文件。')
    } else if (batchError) {
      const totalFiles = completedBatches.reduce((sum, batch) => sum + batch.count, 0)
      appendAssistantMessage(totalFiles > 0 ? `批量生成中断：已生成 ${totalFiles} 个文件，失败原因：${batchError}` : `批量生成失败：${batchError}`)
    } else if (completedBatches.length > 0) {
      if (firstGeneratedFile) await useEditorStore.getState().openFile(firstGeneratedFile)
      appendAssistantMessage(`批量生成完成：${completedBatches.map((batch) => `「${batch.dir}」${batch.count} 篇`).join('、')}。`)
    }
    activeBatchPlanMsgIdsRef.current.delete(sharedPlan.id)
  }

  const handleConfirmBatchPlan = () => {
    if (!pendingBatchPlan) return
    const plan = {
      instruction: pendingBatchPlan.instruction,
      batches: normalizeEditableBatchPlan(pendingBatchPlan.batches)
    }
    if (plan.batches.length === 0) {
      toast('请至少保留一个目录计划', 'info')
      return
    }
    setPendingBatchPlan(null)
    void executeBatchPlan(plan.instruction, plan.batches)
  }

  const updatePendingBatchPlanBatch = (index: number, patch: Partial<GeneratedNoteBatchPlanItem>) => {
    setPendingBatchPlan((plan) => {
      if (!plan) return plan
      return {
        ...plan,
        batches: plan.batches.map((batch, i) => i === index ? { ...batch, ...patch } : batch)
      }
    })
  }

  const removePendingBatchPlanBatch = (index: number) => {
    setPendingBatchPlan((plan) => {
      if (!plan) return plan
      return { ...plan, batches: plan.batches.filter((_, i) => i !== index) }
    })
  }

  const addPendingBatchPlanBatch = () => {
    setPendingBatchPlan((plan) => {
      if (!plan) return plan
      return { ...plan, batches: [...plan.batches, createEditableBatchPlanItem(plan.batches.length)] }
    })
  }

  const finishStoppedGeneration = (message = '已停止。') => {
    editCompleteRef.current = true
    streamContentRef.current = ''
    setStreamContent('')
    if (editTimerRef.current) clearInterval(editTimerRef.current)
    editTimerRef.current = null
    setIsStreaming(false)
    setToolStatus(null)
    appendAssistantMessage(message)
  }

  const finishStoppedBatchWithoutFiles = () => {
    finishStoppedGeneration('已停止，未生成新文件。')
  }

  const handleSelectFolder = (folderName: string) => {
    if (!pendingBatch || !vaultPath) return
    batchCancelledRef.current = false
    setPendingBatchPlan(null)
    const targetDir = `${vaultPath}/${folderName}`
    const confirmMsg: Message = { id: Date.now().toString(), role: 'user', content: folderName }
    setMessages((msgs) => [...msgs, confirmMsg])
    appendToDb(confirmMsg)
    setPendingBatch(null)
    setFolderOptions([])
    executeBatchGenerate(pendingBatch.instruction, targetDir)
  }

  const collectAttachmentContext = async (): Promise<string> => {
    let contextPrefix = ''
    let remaining = MAX_ATTACHMENT_CONTEXT_CHARS
    let truncated = false
    const appendContext = (label: string, text: string) => {
      if (remaining <= 0) {
        truncated = true
        return
      }
      const prefix = `${label}\n`
      const suffix = '\n\n'
      const available = remaining - prefix.length - suffix.length
      if (available <= 0) {
        truncated = true
        return
      }
      const body = text.length > available ? `${text.slice(0, available)}\n...[内容已截断]` : text
      if (text.length > available) truncated = true
      contextPrefix += `${prefix}${body}${suffix}`
      remaining -= prefix.length + body.length + suffix.length
    }

    if (attachedNotes.length > 0 && vaultPath) {
      for (const note of attachedNotes) {
        try {
          const fullPath = note.filePath.startsWith('/') || note.filePath.includes(':')
            ? note.filePath
            : `${vaultPath}/${note.filePath}`
          const content = await window.api.invoke('file:read', { path: fullPath })
          appendContext(`[笔记: ${note.title}]`, content)
        } catch {}
      }
      setAttachedNotes([])
    }
    if (attachedSelections.length > 0) {
      for (const sel of attachedSelections) {
        appendContext(`[选中片段: ${sel.source}]`, sel.text)
      }
      setAttachedSelections([])
    }
    if (attachedDocuments.length > 0) {
      appendContext('[文档附件]', buildDocumentAttachmentContext(attachedDocuments))
      setAttachedDocuments([])
    }
    if (truncated) {
      toast('引用内容过长，已自动截断后发送', 'info')
    }
    return contextPrefix
  }

  const applyChatAttachments = (chatMessages: IPCChatMessage[], userContent: string, contextPrefix: string, images: string[]): IPCChatMessage[] => {
    const nextMessages = [...chatMessages]
    if (contextPrefix) {
      nextMessages[nextMessages.length - 1] = {
        role: 'user',
        content: `以下是参考笔记内容：\n\n${contextPrefix}\n用户问题：${userContent}`
      }
    }
    if (images.length > 0) {
      const currentContent = nextMessages[nextMessages.length - 1].content
      const imageContent: ChatContentPart[] = [
        { type: 'text', text: typeof currentContent === 'string' ? currentContent : '' },
        ...images.map((img) => ({ type: 'image_url' as const, image_url: { url: img } }))
      ]
      nextMessages[nextMessages.length - 1] = {
        role: 'user',
        content: imageContent
      }
    }
    return nextMessages
  }

  const getAvailableNotePath = async (baseDir: string, title: string): Promise<string> => {
    const safeTitle = title.trim().replace(/[\\/:*?"<>|]/g, '') || '新笔记'
    for (let i = 0; i < 100; i++) {
      const suffix = i === 0 ? '' : ` ${i + 1}`
      const path = `${baseDir}/${safeTitle}${suffix}.md`
      try {
        await window.api.invoke('file:stat', { path })
      } catch {
        return path
      }
    }
    return `${baseDir}/${safeTitle} ${Date.now()}.md`
  }

  const handleSend = async () => {
    const hasPendingAttachments = attachedNotes.length > 0 || attachedSelections.length > 0 || attachedImages.length > 0 || attachedDocuments.length > 0
    if (!input.trim() && !hasPendingAttachments) return

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
    if (!providers || providers.length === 0 || !providers.some((p) => p.enabled)) {
      toast('请先在设置中配置 AI 提供商', 'error')
      return
    }

    const sentImages = [...attachedImages]
    const sentDocuments = [...attachedDocuments]
    const attachments: { type: 'note' | 'selection' | 'image' | 'document'; label: string }[] = []
    if (attachedNotes.length > 0) {
      for (const note of attachedNotes) attachments.push({ type: 'note', label: note.title })
    }
    if (attachedSelections.length > 0) {
      for (const sel of attachedSelections) attachments.push({ type: 'selection', label: sel.source })
    }
    if (sentImages.length > 0) {
      for (let i = 0; i < sentImages.length; i++) attachments.push({ type: 'image', label: `图片 ${i + 1}` })
    }
    if (sentDocuments.length > 0) {
      for (const document of sentDocuments) attachments.push({ type: 'document', label: document.name })
    }

    const userContent = input.trim() || '请分析附件内容。'
    batchCancelledRef.current = false
    setPendingBatchPlan(null)
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userContent, attachments: attachments.length > 0 ? attachments : undefined }
    setMessages((prev) => [...prev, userMsg])
    appendToDb(userMsg)
    renameCurrentSessionFromPrompt(userMsg.content, messages.length)
    setInput('')
    safeRemove(draftStorageKey)
    setAttachedImages([])
    setAttachedDocuments([])
    setIsStreaming(true)
    streamContentRef.current = ''
    setStreamContent('')

    const contextPrefix = editMode ? '' : await collectAttachmentContext()

    if (vaultPath && !editMode) {
      const allMessages = [...messages, userMsg]
      const chatMessages = await buildChatMessages(allMessages)
      let intent = 'chat'
      try {
        setToolStatus('识别请求意图...')
        const detected = await window.api.invoke('ai:detect-intent', {
          messages: chatMessages,
          intents: ['graph', 'kanban', 'chat']
        })
        intent = detected.intent || 'chat'
      } catch (e: unknown) {
        if (isCancellationError(e)) {
          editCompleteRef.current = true
          streamContentRef.current = ''
          setStreamContent('')
          setIsStreaming(false)
          setToolStatus(null)
          return
        }
        intent = 'chat'
      }

      if (intent === 'graph') {
        editCompleteRef.current = true
        streamContentRef.current = ''
        setStreamContent('')
        setIsStreaming(false)
        setToolStatus(null)

        let targetPath: string | null = null
        const files = await window.api.invoke('file:list-shallow', { dirPath: vaultPath })
        const dirs = files.filter((f) => f.isDirectory && !f.name.startsWith('.')).map((f) => f.name)
        const text = userMsg.content.toLowerCase()
        const matchedDir = dirs.find((d: string) => text.includes(d.toLowerCase()))
        if (matchedDir) {
          targetPath = `${vaultPath}/${matchedDir}`
        }
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
        window.dispatchEvent(new CustomEvent('index-and-show-graph', { detail: { path: targetPath, isDirectory: true } }))
        return
      }

      if (intent === 'kanban') {
        window.api.invoke('ai:stop', undefined)
        editCompleteRef.current = true
        streamContentRef.current = ''
        setStreamContent('')
        setToolStatus('正在从当前笔记提取看板任务...')

        const fp = useEditorStore.getState().currentFilePath
        if (!fp) {
          setToolStatus(null)
          setIsStreaming(false)
          const msg: Message = { id: Date.now().toString(), role: 'assistant', content: '请先打开一篇笔记，再从当前笔记提取看板任务。' }
          setMessages((msgs) => [...msgs, msg])
          appendToDb(msg)
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
        } catch (e: unknown) {
          const msg: Message = { id: Date.now().toString(), role: 'assistant', content: friendlyError(getErrorMessage(e)) }
          setMessages((msgs) => [...msgs, msg])
          appendToDb(msg)
        } finally {
          setToolStatus(null)
          setIsStreaming(false)
        }
        return
      }

      try {
        setToolStatus(agentMode ? 'Agent 正在处理...' : '正在生成回答...')
        const attachedChatMessages = applyChatAttachments(chatMessages, userMsg.content, contextPrefix, sentImages)
        if (agentMode) {
          await window.api.invoke('ai:chat-agent', { messages: attachedChatMessages, vaultPath, currentFilePath })
        } else {
          await window.api.invoke('ai:chat', { messages: attachedChatMessages, vaultPath })
        }
      } catch (e: unknown) {
        appendAssistantMessage(friendlyError(getErrorMessage(e)))
        streamContentRef.current = ''
        setStreamContent('')
        setIsStreaming(false)
        setToolStatus(null)
      }
      return
    }

    if (editMode) {
      const targetPath = editUnbound ? null : (editTarget || null)
      setEditElapsed(0)
      try {
        const isNewFile = !targetPath

        if (vaultPath) {
          const allMessages = [...messages, userMsg]
          const chatMessages = await buildChatMessages(allMessages)

          const editIntentContext = `Context: user is in EDIT MODE (editing notes). Available intents:
- batch: user wants to generate MULTIPLE separate note files (e.g. "generate 5 notes about...", "write notes for each framework")
- chat: user is asking a question, seeking explanation, or having a conversation (NOT requesting file edits)
- edit: user wants to modify or create a single note file (default for edit mode)`

          let editIntent = 'edit'
          try {
            setToolStatus('识别编辑意图...')
            const detected = await window.api.invoke('ai:detect-intent', {
              messages: chatMessages,
              intents: ['batch', 'edit', 'chat'],
              intentContext: editIntentContext
            })
            editIntent = detected.intent || 'edit'
          } catch (e: unknown) {
            if (isCancellationError(e)) {
              editCompleteRef.current = true
              streamContentRef.current = ''
              setStreamContent('')
              setIsStreaming(false)
              setToolStatus(null)
              return
            }
            editIntent = 'edit'
          }

          if (batchCancelledRef.current) {
            finishStoppedGeneration()
            return
          }

          if (editIntent === 'chat') {
            try {
              setToolStatus('正在生成回答...')
              await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath })
            } catch (e: unknown) {
              if (isCancellationError(e) || batchCancelledRef.current) {
                finishStoppedGeneration()
                return
              }
              appendAssistantMessage(friendlyError(getErrorMessage(e)))
              streamContentRef.current = ''
              setStreamContent('')
              setIsStreaming(false)
              setToolStatus(null)
            }
            return
          }

          if (editIntent === 'batch') {
            setToolStatus('正在分析批量目录...')
            streamContentRef.current = ''
            setStreamContent('')

            const files = await window.api.invoke('file:list-shallow', { dirPath: vaultPath })
            if (batchCancelledRef.current) {
              finishStoppedBatchWithoutFiles()
              return
            }
            const dirs = files.filter((f) => f.isDirectory && !f.name.startsWith('.')).map((f) => f.name)

            const recentContext = messages.slice(-10).map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 200)}`).join('\n')
            const batchInstruction = recentContext
              ? `对话上下文：\n${recentContext}\n\n当前指令: ${userMsg.content}`
              : userMsg.content

            let plannedBatches: GeneratedNoteBatchPlanItem[] = []
            try {
              const planned = await window.api.invoke('ai:plan-note-batches', {
                instruction: batchInstruction,
                existingDirs: dirs
              })
              if (planned.success && planned.batches.length > 0) {
                plannedBatches = planned.batches
              }
            } catch (e: unknown) {
              if (isCancellationError(e)) {
                finishStoppedBatchWithoutFiles()
                return
              }
            }

            if (batchCancelledRef.current) {
              finishStoppedBatchWithoutFiles()
              return
            }

            if (plannedBatches.length > 0) {
              setPendingBatchPlan({ instruction: batchInstruction, batches: plannedBatches })
              setIsStreaming(false)
              setToolStatus(null)
              if (editTimerRef.current) clearInterval(editTimerRef.current)
              editTimerRef.current = null
              appendAssistantMessage(`已规划 ${plannedBatches.length} 个目录、共 ${plannedBatches.reduce((sum, batch) => sum + batch.count, 0)} 篇笔记。确认后开始生成。`)
            } else {
              const specifiedDirs = dirs.filter((dir) => userMsg.content.toLowerCase().includes(dir.toLowerCase()))
              if (specifiedDirs.length > 0) {
                if (editTimerRef.current) clearInterval(editTimerRef.current)
                editTimerRef.current = null
                const sharedPlan: SharedBatchPlan = { id: Date.now().toString(), items: [] }
                activeBatchPlanMsgIdsRef.current.add(sharedPlan.id)
                setMessages((msgs) => [...msgs, { id: sharedPlan.id, role: 'assistant', content: '○ 正在规划批量笔记...' }])
                const completedBatches: { dir: string; count: number }[] = []
                let firstGeneratedFile: string | null = null
                let batchError: string | null = null
                for (const dir of specifiedDirs) {
                  if (batchCancelledRef.current) break
                  const perDirInstruction = `${batchInstruction}\n\n注意：本次只生成与「${dir}」主题相关的笔记，放到「${dir}」目录下。`
                  const result = await executeBatchGenerate(perDirInstruction, `${vaultPath}/${dir}`, { label: dir, silentSummary: true, sharedPlan, suppressResultMessage: true, openFirstFile: false })
                  if (result.files.length > 0) {
                    if (!firstGeneratedFile) firstGeneratedFile = result.files[0]
                    completedBatches.push({ dir, count: result.files.length })
                  }
                  if (!result.success) {
                    batchError = result.error || '未知错误'
                    break
                  }
                  if (batchCancelledRef.current) break
                }
                if (batchCancelledRef.current) {
                  const totalFiles = completedBatches.reduce((sum, batch) => sum + batch.count, 0)
                  appendAssistantMessage(totalFiles > 0 ? `已停止，已生成 ${totalFiles} 个文件。` : '已停止，未生成新文件。')
                } else if (batchError) {
                  const totalFiles = completedBatches.reduce((sum, batch) => sum + batch.count, 0)
                  appendAssistantMessage(totalFiles > 0 ? `批量生成中断：已生成 ${totalFiles} 个文件，失败原因：${batchError}` : `批量生成失败：${batchError}`)
                } else if (completedBatches.length > 0) {
                  if (firstGeneratedFile) await useEditorStore.getState().openFile(firstGeneratedFile)
                  appendAssistantMessage(`批量生成完成：${completedBatches.map((batch) => `「${batch.dir}」${batch.count} 篇`).join('、')}。`)
                }
                activeBatchPlanMsgIdsRef.current.delete(sharedPlan.id)
                return
              }

              setFolderOptions(dirs)
              setPendingBatch({ instruction: batchInstruction })
              setIsStreaming(false)
              setToolStatus(null)
              if (editTimerRef.current) clearInterval(editTimerRef.current)
              editTimerRef.current = null
              appendAssistantMessage('无法自动规划批量目录，请选择笔记存放目录：')
            }
            return
          }

          // editIntent === 'edit': proceed with normal edit flow
          setToolStatus(isNewFile ? '正在生成新笔记...' : '正在生成修改方案...')
          streamContentRef.current = ''
          setStreamContent('')
        }

        let fileContent = ''
        let filePath = targetPath || (editUnbound ? '' : currentFilePath) || ''
        if (filePath) {
          fileContent = await window.api.invoke('file:read', { path: filePath })
        }
        if (batchCancelledRef.current) {
          finishStoppedGeneration()
          return
        }

        editTimerRef.current = setInterval(() => setEditElapsed((t) => t + 1), 1000)
        const selectionContext = attachedSelections.length > 0
          ? `\n\n选中文本上下文：\n${attachedSelections.map((sel) => `[${sel.source}]\n${sel.text}`).join('\n\n')}`
          : ''
        const documentContext = sentDocuments.length > 0 ? `\n\n文档附件上下文：\n${buildDocumentAttachmentContext(sentDocuments)}` : ''
        const editInstruction = `${userMsg.content}${selectionContext}${documentContext}`
        setAttachedDocuments([])
        if (batchCancelledRef.current) {
          finishStoppedGeneration()
          return
        }
        const result = await window.api.invoke('ai:edit', {
          instruction: !filePath
            ? `创建一篇新笔记。要求：${editInstruction}`
            : editInstruction,
          fileContent,
          filePath: filePath || '(新文件)',
          images: sentImages.length > 0 ? sentImages : undefined,
          history: editHistory.length > 0 ? editHistory : undefined
        })
        setAttachedImages([])
        setAttachedSelections([])
        if (result.success && result.content) {
          setEditHistory((prev) => [...prev, userMsg.content])
          if (!filePath && vaultPath) {
            const titleMatch = result.content.match(/^#\s+(.+)$/m)
            const title = titleMatch ? titleMatch[1].trim().replace(/[\\/:*?"<>|]/g, '') : '新笔记'
            const newPath = await getAvailableNotePath(vaultPath, title)
            await window.api.invoke('file:create', { path: newPath, content: result.content, vaultPath })
            await useVaultStore.getState().refreshFiles()
            await useEditorStore.getState().openFile(newPath)
            const createdTitle = newPath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || title
            const msg: Message = { id: Date.now().toString(), role: 'assistant', content: `已创建笔记「${createdTitle}」并打开。` }
            setMessages((msgs) => [...msgs, msg])
            appendToDb(msg)
          } else {
            setEditResult({ content: result.content, original: fileContent, filePath: filePath })
            setEditPreviewMode('diff')
            appendAssistantMessage('已生成修改方案，请查看下方预览并确认应用。')
          }
        } else {
          appendAssistantMessage(isCancellationError(result.error) ? '已停止生成修改方案。' : `编辑失败: ${result.error}`)
        }
      } catch (e: unknown) {
        if (isCancellationError(e) || batchCancelledRef.current) {
          finishStoppedGeneration('已停止生成修改方案。')
          return
        }
        appendAssistantMessage(friendlyError(getErrorMessage(e)))
      }
      if (editTimerRef.current) clearInterval(editTimerRef.current)
      editTimerRef.current = null
      editCompleteRef.current = true
      setIsStreaming(false)
      setToolStatus(null)
      return
    }

    const allMessages = [...messages, userMsg]
    const chatMessages = applyChatAttachments(await buildChatMessages(allMessages), userMsg.content, contextPrefix, sentImages)
    try {
      if (agentMode && vaultPath) {
        await window.api.invoke('ai:chat-agent', { messages: chatMessages, vaultPath, currentFilePath })
      } else {
        await window.api.invoke('ai:chat', { messages: chatMessages, vaultPath: vaultPath || undefined })
      }
    } catch (e: unknown) {
      if (isCancellationError(e) || batchCancelledRef.current) {
        finishStoppedGeneration()
        return
      }
      appendAssistantMessage(friendlyError(getErrorMessage(e)))
      setStreamContent('')
      setIsStreaming(false)
    }
  }

  const handleApplyEdit = async () => {
    if (!editResult) return
    const store = useEditorStore.getState()
    const tabIndex = store.tabs.findIndex((t) => t.path === editResult.filePath)
    const openTab = tabIndex >= 0 ? store.tabs[tabIndex] : null
    if (openTab?.isDirty && openTab.content !== editResult.original) {
      appendAssistantMessage('目标笔记已有未保存修改。为避免覆盖，请先保存或重新生成修改方案。')
      return
    }
    try {
      const latestContent = await window.api.invoke('file:read', { path: editResult.filePath })
      if (latestContent !== editResult.original) {
        appendAssistantMessage('目标笔记已在生成后发生变化。为避免覆盖，请重新生成修改方案。')
        return
      }
    } catch (e: unknown) {
      appendAssistantMessage(`应用修改前无法确认文件状态: ${friendlyError(getErrorMessage(e))}`)
      return
    }

    await window.api.invoke('file:write', { path: editResult.filePath, content: editResult.content, vaultPath: vaultPath || undefined })
    await useVaultStore.getState().refreshFiles()
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
    appendAssistantMessage(`已应用修改到「${appliedFile}」。`)
  }

  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        attachImageFile(file)
      } else if (item.kind === 'file') {
        const file = item.getAsFile() as FileWithPath | null
        if (file && isSupportedAiDocumentName(file.name)) {
          e.preventDefault()
          void attachDocumentFromFile(file)
        }
      }
    }
  }

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files) as FileWithPath[]) {
      const attached = await attachFileForAi(file)
      if (!attached) toast(`暂不支持该附件：${file.name}`, 'info')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
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
    await useVaultStore.getState().refreshFiles([path])
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
          addAttachedNote({ title, filePath: text })
          return
        }
        if (await attachDocumentFromPath(text)) return
        // Folder path — list .md files inside
        if (vaultPath && !text.includes('\n') && (text.startsWith('/') || text.includes(':'))) {
          try {
            const files = await window.api.invoke('file:list', { dirPath: text })
            const mdFiles = flattenMdFiles(files)
            setAttachedNotes((prev) => {
              const next = [...prev]
              for (const f of mdFiles) {
                if (next.length >= MAX_ATTACHED_NOTES) break
                if (!next.some((n) => n.filePath === f.path)) {
                  next.push({ title: f.name.replace(/\.md$/, ''), filePath: f.path })
                }
              }
              if (mdFiles.length > 0 && next.length < prev.length + mdFiles.length) {
                toast(`最多一次引用 ${MAX_ATTACHED_NOTES} 篇笔记，已添加前 ${Math.max(0, next.length - prev.length)} 篇`, 'info')
              }
              return next
            })
            if (mdFiles.length > 0) return
          } catch {}
        }
        // Plain text
        if (!nexuskyPath && text.length >= 3) {
          const source = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '拖入文本'
          setAttachedSelections((prev) => {
            if (prev.length >= MAX_ATTACHED_SELECTIONS) {
              toast(`最多一次引用 ${MAX_ATTACHED_SELECTIONS} 段文本`, 'info')
              return prev
            }
            return [...prev, { text: text.slice(0, SELECTION_CHAR_LIMIT), source }]
          })
          return
        }
      }

      // From OS file manager: dataTransfer.files
      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        for (const file of files) {
          const droppedFile = file as FileWithPath
          if (file.name.endsWith('.md') && droppedFile.path) {
            const filePath = droppedFile.path
            const title = file.name.replace(/\.md$/, '')
            addAttachedNote({ title, filePath })
          } else {
            await attachDocumentFromFile(droppedFile)
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
  }, [vaultPath, currentFilePath, addAttachedNote, attachDocumentFromFile, attachDocumentFromPath])

  const canSend = input.trim().length > 0 || attachedNotes.length > 0 || attachedSelections.length > 0 || attachedImages.length > 0 || attachedDocuments.length > 0

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
        editStreamContent={editStreamContent}
        toolStatus={toolStatus}
        onRegenerate={handleRegenerate}
        onContinue={handleContinue}
      />

      {/* Confirm AI-planned batch generation before writing files */}
      {pendingBatchPlan && (
        <div style={{ padding: '8px 14px', flexShrink: 0 }}>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--accent-muted)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>确认批量生成计划</div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {pendingBatchPlan.batches.length} 个目录，预计 {pendingBatchPlan.batches.reduce((sum, batch) => sum + batch.count, 0)} 篇笔记
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={addPendingBatchPlanBatch}
                  style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--accent-text)', background: 'var(--accent-muted)', border: '1px solid var(--accent-muted)', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  添加目录
                </button>
                <button
                  onClick={handleConfirmBatchPlan}
                  disabled={pendingBatchPlan.batches.length === 0}
                  style={{ height: 28, padding: '0 12px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: pendingBatchPlan.batches.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 500, whiteSpace: 'nowrap', opacity: pendingBatchPlan.batches.length === 0 ? 0.5 : 1 }}
                >
                  开始生成
                </button>
                <button
                  onClick={() => setPendingBatchPlan(null)}
                  style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}
                >
                  取消
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
              {pendingBatchPlan.batches.map((batch, index) => (
                <div key={`${index}:${batch.dir}:${batch.topic}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 62px 24px', gap: 6, alignItems: 'center', padding: '7px 9px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 7 }}>
                  <div style={{ minWidth: 0, display: 'grid', gap: 5 }}>
                    <input
                      value={batch.dir}
                      onChange={(e) => updatePendingBatchPlanBatch(index, { dir: e.currentTarget.value })}
                      placeholder="目录"
                      title="目录"
                      style={{ width: '100%', height: 24, padding: '0 7px', fontSize: 12, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 5, color: 'var(--text-primary)', outline: 'none', minWidth: 0 }}
                    />
                    <input
                      value={batch.topic}
                      onChange={(e) => updatePendingBatchPlanBatch(index, { topic: e.currentTarget.value })}
                      placeholder="主题"
                      title="主题"
                      style={{ width: '100%', height: 24, padding: '0 7px', fontSize: 11, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 5, color: 'var(--text-secondary)', outline: 'none', minWidth: 0 }}
                    />
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={MAX_EDITABLE_BATCH_NOTE_COUNT}
                    value={batch.count}
                    onChange={(e) => updatePendingBatchPlanBatch(index, { count: normalizeEditableBatchCount(e.currentTarget.value) })}
                    title="篇数"
                    style={{ width: 62, height: 28, padding: '0 7px', fontSize: 12, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 5, color: 'var(--accent-text)', outline: 'none' }}
                  />
                  <button
                    onClick={() => removePendingBatchPlanBatch(index)}
                    title="移除该目录"
                    style={{ width: 24, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 5, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                <div style={{ display: 'flex', marginLeft: 8, background: 'var(--bg-surface)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => setEditPreviewMode('diff')}
                    style={{ height: 22, padding: '0 8px', fontSize: 10, border: 'none', cursor: 'pointer', background: editPreviewMode === 'diff' ? 'var(--accent)' : 'transparent', color: editPreviewMode === 'diff' ? '#fff' : 'var(--text-tertiary)', fontWeight: 500, transition: 'all 100ms' }}
                  >
                    Diff
                  </button>
                  <button
                    onClick={() => setEditPreviewMode('preview')}
                    style={{ height: 22, padding: '0 8px', fontSize: 10, border: 'none', cursor: 'pointer', background: editPreviewMode === 'preview' ? 'var(--accent)' : 'transparent', color: editPreviewMode === 'preview' ? '#fff' : 'var(--text-tertiary)', fontWeight: 500, transition: 'all 100ms' }}
                  >
                    预览
                  </button>
                </div>
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
            {editPreviewMode === 'diff' ? (
              <div style={{ maxHeight: editPreviewExpanded ? 'none' : 120, overflowY: 'auto', flex: editPreviewExpanded ? 1 : 'none', minHeight: 0 }}>
                <DiffView original={editResult.original} modified={editResult.content} />
              </div>
            ) : (
              <div
                className="editor-content"
                style={{ padding: '12px 16px', maxHeight: editPreviewExpanded ? 'none' : 120, overflowY: 'auto', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', flex: editPreviewExpanded ? 1 : 'none', minHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(editResult.content) }}
              />
            )}
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
          {(attachedNotes.length > 0 || attachedSelections.length > 0 || attachedImages.length > 0 || attachedDocuments.length > 0) && (
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
              {attachedDocuments.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {attachedDocuments.map((document) => (
                    <span key={document.path || document.name} style={{ maxWidth: 180, fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{document.name}</span>
                      <button onClick={() => setAttachedDocuments((prev) => prev.filter((item) => (item.path || item.name) !== (document.path || document.name)))} style={{ width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md,.txt,.csv,.tsv,.rtf,.pdf,.doc,.docx,.xls,.xlsx,image/*"
              onChange={(event) => { void handleAttachFiles(event.currentTarget.files) }}
              style={{ display: 'none' }}
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onPaste={handleImagePaste}
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
                onClick={stopGeneration}
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
              <>
              <button
                onClick={() => fileInputRef.current?.click()}
                type="button"
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', color: 'var(--text-tertiary)',
                  border: 'none', borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'background 150ms, color 150ms',
                  flexShrink: 0,
                }}
                title="添加图片、笔记或文档附件"
                aria-label="添加附件"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.4 11.6l-8.8 8.8a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.7 9.7a2 2 0 0 1-2.8-2.8l8.9-8.9" />
                </svg>
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: canSend ? 'var(--accent)' : 'transparent',
                  color: canSend ? '#fff' : 'var(--text-tertiary)',
                  border: 'none', borderRadius: 8,
                  cursor: canSend ? 'pointer' : 'default',
                  transition: 'background 150ms, color 150ms',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
              </>
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
                title={agentMode ? 'Agent 模式：AI 可搜索/读取笔记，修改请切换编辑模式' : '普通模式：仅对话'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                Agent
              </button>
            )}
            <div style={{ flex: 1 }} />
            {tokenCount > 0 && (
              <span
                style={{ fontSize: 10, color: tokenCount > 5000 ? 'var(--warning, #f59e0b)' : 'var(--text-tertiary)', opacity: tokenCount > 5000 ? 0.9 : 0.5, marginRight: 6 }}
                title={`当前对话约 ${tokenCount} tokens`}
              >
                ~{tokenCount > 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : tokenCount} tokens
              </span>
            )}
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
