import type { AIProviderConfig, AppLanguage, AIOutboundPreview, AIOutboundPreviewMode, AIOutboundPreviewSnippet } from '@shared/types/ipc'
import type { ChatMessage } from './base-provider'
import type { LongContextPack, LongContextPackItem } from '../long-context/context-pack-builder'

export interface RetrievedNotePreview {
  title: string
  filePath: string
  chunk: string
  score: number
}

interface BuildAIOutboundPreviewParams {
  messages: ChatMessage[]
  mode: AIOutboundPreviewMode
  provider: AIProviderConfig | null
  providerError?: string | null
  vaultPath?: string
  currentFilePath?: string | null
  language?: AppLanguage
  retrievedNotes?: RetrievedNotePreview[]
  longContextPack?: LongContextPack | null
  toolNames?: string[]
}

const SNIPPET_LIMIT = 280
const LONG_CONTEXT_SNIPPET_LIMIT = 4
const CLIENT_CONTEXT_SNIPPET_LIMIT = 4
const ATTACHMENT_SNIPPET_LIMIT = 8

export function buildAIOutboundPreview(params: BuildAIOutboundPreviewParams): AIOutboundPreview {
  const mode = params.mode
  const messages = params.messages
  const longContextPack = params.longContextPack || null
  const retrievedNotes = params.retrievedNotes || []
  const textMessages = messages.map((message) => ({
    role: message.role,
    text: chatContentToPreviewText(message.content)
  }))
  const lastUserText = [...textMessages].reverse().find((message) => message.role === 'user')?.text || ''
  const promptPreview = extractUserPromptText(lastUserText)
  const attachmentSnippets = extractAttachmentSnippetsFromText(lastUserText).slice(0, ATTACHMENT_SNIPPET_LIMIT)
  const clientContextSnippets = textMessages
    .filter((message) => message.role === 'system')
    .map((message) => systemMessageToSnippet(message.text))
    .filter((snippet): snippet is AIOutboundPreviewSnippet => Boolean(snippet))
    .slice(0, CLIENT_CONTEXT_SNIPPET_LIMIT)
  const retrievedNoteSnippets = retrievedNotes.map((note): AIOutboundPreviewSnippet => ({
    kind: 'retrieved_note',
    title: note.title,
    filePath: note.filePath,
    preview: truncatePreview(note.chunk, SNIPPET_LIMIT),
    score: note.score,
    chars: note.chunk.length
  }))
  const longContextSnippets = longContextPack
    ? [...longContextPack.hot, ...longContextPack.warm, ...longContextPack.cold]
      .slice(0, LONG_CONTEXT_SNIPPET_LIMIT)
      .map(longContextItemToSnippet)
    : []
  const imageCount = messages.reduce((sum, message) => sum + countImages(message.content), 0)
  const messageTextTokens = textMessages.reduce((sum, message) => sum + estimateStringTokens(message.text), 0)
  const retrievedTokens = retrievedNotes.reduce((sum, note) => sum + estimateStringTokens(note.chunk), 0)
  const longContextTokens = longContextPack?.estimatedTokens || 0
  const warnings = buildWarnings(params, retrievedNoteSnippets, imageCount)

  return {
    mode,
    provider: params.provider
      ? {
        id: params.provider.id,
        name: params.provider.name || params.provider.type,
        type: params.provider.type,
        model: params.provider.model,
        localOnly: params.provider.type === 'ollama'
      }
      : null,
    messageCount: messages.length,
    systemMessageCount: messages.filter((message) => message.role === 'system').length,
    userMessageCount: messages.filter((message) => message.role === 'user').length,
    imageCount,
    estimatedTokens: messageTextTokens + retrievedTokens + longContextTokens,
    currentFilePath: params.currentFilePath,
    promptPreview: truncatePreview(promptPreview || lastUserText, SNIPPET_LIMIT),
    clientContextSnippets,
    attachmentSnippets,
    retrievedNoteSnippets,
    longContext: {
      hot: longContextPack?.hot.length || 0,
      warm: longContextPack?.warm.length || 0,
      cold: longContextPack?.cold.length || 0,
      dropped: longContextPack?.droppedItems.length || 0,
      sources: longContextPack?.sources.length || 0,
      estimatedTokens: longContextTokens,
      snippets: longContextSnippets
    },
    toolAccess: mode === 'agent'
      ? {
        toolCount: params.toolNames?.length || 0,
        toolNames: (params.toolNames || []).slice(0, 12)
      }
      : undefined,
    warnings
  }
}

export function chatContentToPreviewText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text || '')
    .join('\n')
}

export function extractUserPromptText(text: string): string {
  const marker = '用户问题：'
  const index = text.lastIndexOf(marker)
  if (index < 0) return text.trim()
  return text.slice(index + marker.length).trim()
}

export function extractAttachmentSnippetsFromText(text: string): AIOutboundPreviewSnippet[] {
  const boundaryIndex = text.lastIndexOf('\n用户问题：')
  const contextText = boundaryIndex >= 0 ? text.slice(0, boundaryIndex) : text
  const lines = contextText.split('\n')
  const snippets: AIOutboundPreviewSnippet[] = []
  let current: { title: string; body: string[] } | null = null

  const flush = () => {
    if (!current) return
    const body = current.body.join('\n').trim()
    if (body) {
      snippets.push({
        kind: 'attachment',
        title: current.title,
        preview: truncatePreview(body, SNIPPET_LIMIT),
        chars: body.length
      })
    }
    current = null
  }

  for (const line of lines) {
    const match = line.match(/^\[(笔记|选中片段|文档附件)(?::\s*([^\]]+))?\]$/)
    if (match) {
      flush()
      current = { title: match[2]?.trim() || match[1], body: [] }
      continue
    }
    if (current) current.body.push(line)
  }
  flush()
  return snippets
}

export function estimateStringTokens(text: string): number {
  let cjk = 0
  let other = 0
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

function buildWarnings(
  params: BuildAIOutboundPreviewParams,
  retrievedNoteSnippets: AIOutboundPreviewSnippet[],
  imageCount: number
): string[] {
  const warnings: string[] = []
  if (!params.provider) {
    warnings.push(params.language === 'en' ? 'No enabled AI provider is configured.' : '未配置可用的 AI Provider。')
  } else if (params.providerError) {
    warnings.push(params.providerError)
  }
  if (params.mode === 'chat' && params.vaultPath && retrievedNoteSnippets.length === 0) {
    warnings.push(params.language === 'en'
      ? 'No matching note snippets were found for this request.'
      : '本次未检索到会加入请求的笔记片段。')
  }
  if (params.mode === 'agent') {
    warnings.push(params.language === 'en'
      ? 'Agent mode sends tool schemas first; notes read by tools will appear as sources during the run.'
      : 'Agent 模式会先发送工具定义；后续工具读取到的笔记会在运行中作为来源显示。')
  }
  if (imageCount > 0) {
    warnings.push(params.language === 'en'
      ? `${imageCount} image(s) will be sent as multimodal input.`
      : `${imageCount} 张图片会作为多模态输入发送。`)
  }
  return warnings
}

function systemMessageToSnippet(text: string): AIOutboundPreviewSnippet | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  let title = '客户端上下文'
  if (trimmed.includes('当前打开笔记')) title = '当前笔记指针'
  else if (/summary|摘要/i.test(trimmed)) title = '对话摘要'
  return {
    kind: 'client_context',
    title,
    preview: truncatePreview(trimmed, SNIPPET_LIMIT),
    chars: trimmed.length
  }
}

function longContextItemToSnippet(item: LongContextPackItem): AIOutboundPreviewSnippet {
  const evidence = item.evidence.length > 0 ? `\n证据: ${item.evidence.slice(0, 2).join(' | ')}` : ''
  const meta = [
    item.relationType ? `关系: ${item.relationType}` : '',
    typeof item.confidence === 'number' ? `置信度: ${Math.round(item.confidence * 100)}%` : ''
  ].filter(Boolean).join('; ')
  return {
    kind: 'long_context',
    title: `${tierLabel(item.tier)}: ${item.title}`,
    filePath: item.source,
    preview: truncatePreview(`${meta ? `${meta}\n` : ''}${item.reason}${evidence}`, SNIPPET_LIMIT),
    score: item.score ?? item.confidence,
    chars: item.reason.length + item.evidence.join('').length
  }
}

function countImages(content: ChatMessage['content']): number {
  if (typeof content === 'string') return 0
  return content.filter((part) => part.type === 'image_url' && part.image_url?.url).length
}

function truncatePreview(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}...`
}

function tierLabel(tier: LongContextPackItem['tier']): string {
  if (tier === 'hot') return 'Hot'
  if (tier === 'warm') return 'Warm'
  return 'Cold'
}
