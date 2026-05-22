import { aiManager } from '../ai'
import type { ChatMessage, ChatOptions, ChatStreamEvent } from '../ai'
import { extractJsonFromText } from '../ai/json'

export const LONG_CONTEXT_RELATION_TYPES = [
  'related_to',
  'caused_by',
  'evolved_from',
  'blocked_by',
  'inspired_by',
  'repeated_pattern',
  'supports_goal',
  'conflicts_with'
] as const

export type RelationType = typeof LONG_CONTEXT_RELATION_TYPES[number]

export interface RelationClassificationInput {
  current: {
    title: string
    content: string
  }
  candidate: {
    title: string
    content: string
  }
  signals: string[]
}

export interface RelationClassification {
  relationType: RelationType
  confidence: number
  reason: string
  evidence: string[]
}

export interface RelationClassifierProvider {
  chatStream(messages: ChatMessage[], signal?: AbortSignal, options?: ChatOptions): AsyncGenerator<ChatStreamEvent>
}

export interface ClassifyRelationOptions {
  provider?: RelationClassifierProvider
  signal?: AbortSignal
}

const MIN_PERSIST_CONFIDENCE = 0.65
const MIN_PERSIST_EVIDENCE = 2
const MIN_REASON_LENGTH = 12
const MAX_CONTENT_CHARS = 6000
const MAX_EVIDENCE_ITEMS = 6
const ALLOWED_RELATION_TYPES = new Set<string>(LONG_CONTEXT_RELATION_TYPES)

export async function classifyRelation(
  input: RelationClassificationInput,
  options: ClassifyRelationOptions = {}
): Promise<RelationClassification> {
  const provider = options.provider || getActiveProvider()
  if (!provider) return fallbackClassification()

  let response = ''
  try {
    for await (const event of provider.chatStream(buildRelationClassificationPrompt(input), options.signal, { temperature: 0 })) {
      if (event.type === 'text') response += event.content
      if (event.type === 'error') return fallbackClassification()
    }
  } catch {
    return fallbackClassification()
  }

  return parseRelationClassification(response)
}

export function buildRelationClassificationPrompt(input: RelationClassificationInput): ChatMessage[] {
  const payload = {
    current: {
      title: trimText(input.current.title, 300),
      content: trimText(input.current.content, MAX_CONTENT_CHARS)
    },
    candidate: {
      title: trimText(input.candidate.title, 300),
      content: trimText(input.candidate.content, MAX_CONTENT_CHARS)
    },
    signals: input.signals.slice(0, 20)
  }

  return [
    {
      role: 'system',
      content: [
        'You are classifying long-term cognitive relationships between two user knowledge items.',
        '',
        'Allowed relation types:',
        '- related_to',
        '- caused_by',
        '- evolved_from',
        '- blocked_by',
        '- inspired_by',
        '- repeated_pattern',
        '- supports_goal',
        '- conflicts_with',
        '',
        'Return strict JSON only:',
        '{"relationType":"...","confidence":0.0,"reason":"...","evidence":["...","..."]}',
        '',
        'Rules:',
        '- Do not output Markdown.',
        '- Do not return any extra explanation.',
        '- Confidence must be a number from 0 to 1.',
        '- Evidence must be grounded in the given content.',
        '- If there is no concrete evidence, set confidence below 0.4.',
        '- Do not infer personal facts unless they are explicit.',
        '- Prefer repeated_pattern only when both items show a recurring behavior, problem, or theme.'
      ].join('\n')
    },
    {
      role: 'user',
      content: `Classify this pair:\n${JSON.stringify(payload, null, 2)}`
    }
  ]
}

export function parseRelationClassification(text: string): RelationClassification {
  try {
    const parsed = extractJsonFromText<Partial<RelationClassification>>(text, 'object')
    return normalizeClassification(parsed)
  } catch {
    return fallbackClassification()
  }
}

export function shouldPersistRelationClassification(classification: RelationClassification): boolean {
  return classification.confidence >= MIN_PERSIST_CONFIDENCE
    && classification.evidence.length >= MIN_PERSIST_EVIDENCE
    && classification.reason.trim().length >= MIN_REASON_LENGTH
}

export function fallbackClassification(): RelationClassification {
  return {
    relationType: 'related_to',
    confidence: 0,
    reason: '',
    evidence: []
  }
}

function normalizeClassification(parsed: Partial<RelationClassification>): RelationClassification {
  const relationType = ALLOWED_RELATION_TYPES.has(String(parsed.relationType))
    ? parsed.relationType as RelationType
    : 'related_to'
  let confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
    ? parsed.confidence
    : 0
  confidence = clamp01(confidence)

  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, MAX_EVIDENCE_ITEMS)
    : []
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : ''

  if (evidence.length === 0) confidence = Math.min(confidence, 0.39)
  if (!reason) confidence = Math.min(confidence, 0.39)

  return {
    relationType,
    confidence,
    reason,
    evidence
  }
}

function getActiveProvider(): RelationClassifierProvider | null {
  const config = aiManager.getActiveConfig()
  if (!config) return null
  if (aiManager.validateConfig(config)) return null
  return aiManager.getProvider(config)
}

function trimText(value: string, max: number): string {
  const normalized = value.trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trim()}...`
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
