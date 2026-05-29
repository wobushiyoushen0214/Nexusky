export interface AIProvider {
  id: string
  name: string
  type: 'openai' | 'claude' | 'custom' | 'ollama' | 'codex'
  baseUrl: string
  apiKey: string
  models: AIModel[]
  defaultModel: string
  enabled: boolean
}

export interface AIModel {
  id: string
  name: string
  contextWindow: number
  supportsStreaming: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sources?: NoteReference[]
  timestamp: number
}

export interface NoteReference {
  noteId: string
  title: string
  chunk: string
  relevanceScore: number
}

export interface ChatParams {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface ChatChunk {
  content: string
  done: boolean
}
