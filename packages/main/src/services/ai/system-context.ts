import type { ChatMessage } from './base-provider'

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
