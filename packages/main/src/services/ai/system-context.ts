import type { ChatMessage } from './base-provider'
import type { AppLanguage } from '@shared/types/ipc'
import { getAiOutputLanguageInstruction } from './language'

export function chatContentToText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('\n')
}

export function withMergedSystemContext(systemContent: string, messages: ChatMessage[]): ChatMessage[] {
  const clientContext = messages
    .filter((message) => message.role === 'system')
    .map((message) => chatContentToText(message.content).trim())
    .filter(Boolean)
    .join('\n\n')

  const content = clientContext
    ? `${systemContent}\n\n<client_context>\n${clientContext}\n</client_context>`
    : systemContent

  return [
    { role: 'system', content },
    ...messages.filter((message) => message.role !== 'system')
  ]
}

export function getNoVaultEvidenceInstruction(language: AppLanguage = 'zh-CN'): string {
  if (language === 'en') {
    return `<local_evidence_boundary>
No retrieval sources or Context Pack sources were found in the local vault for this turn.
- Start by saying that no relevant evidence was found in the local vault.
- You may still answer from general knowledge if useful, but label that part as general knowledge.
- Do not invent citations, imply hidden sources, or claim the answer came from notes.
</local_evidence_boundary>`
  }

  return `<local_evidence_boundary>
本轮没有在本地笔记检索结果或 Context Pack 中找到可引用来源。
- 回答开头必须说明：未在本地笔记中找到相关证据。
- 如果继续使用通用知识回答，必须明确标注为通用知识或一般建议。
- 不要编造引用，不要暗示存在隐藏来源，也不要声称答案来自笔记。
</local_evidence_boundary>`
}

export function buildNoVaultEvidenceSystemPrompt(params: {
  basePrompt?: string
  language?: AppLanguage
}): string {
  const language = params.language || 'zh-CN'
  const basePrompt = params.basePrompt?.trim() || 'You are the user\'s personal Markdown vault assistant.'
  return `${basePrompt}\n\n${getAiOutputLanguageInstruction(language)}\n\n${getNoVaultEvidenceInstruction(language)}`
}
