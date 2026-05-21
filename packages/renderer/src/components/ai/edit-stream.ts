export interface AiEditStreamEvent {
  type: string
  content?: string
}

export function shouldApplyAiEditStreamEvent(isStreaming: boolean, event: AiEditStreamEvent): boolean {
  if (!isStreaming) return false
  if (event.type === 'text') return Boolean(event.content)
  return event.type === 'done'
}
