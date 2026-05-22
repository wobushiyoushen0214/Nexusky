import { describe, expect, it } from 'vitest'
import type { ChatMessage, ChatOptions, ChatStreamEvent } from '../packages/main/src/services/ai'
import {
  buildRelationClassificationPrompt,
  classifyRelation,
  parseRelationClassification,
  shouldPersistRelationClassification,
  type RelationClassifierProvider
} from '../packages/main/src/services/long-context/relation-classifier'

describe('long-context relation classifier', () => {
  it('builds a strict JSON prompt with allowed relation types', () => {
    const messages = buildRelationClassificationPrompt({
      current: { title: 'Current', content: 'Working on AI automation workflows.' },
      candidate: { title: 'MCP Notes', content: 'Notes about MCP tool calling.' },
      signals: ['tag:ai', 'semantic_chunk']
    })

    expect(messages[0].role).toBe('system')
    expect(String(messages[0].content)).toContain('Return strict JSON only')
    expect(String(messages[0].content)).toContain('supports_goal')
    expect(String(messages[1].content)).toContain('"signals"')
  })

  it('recovers JSON from surrounding text and validates a persistable supports_goal relation', () => {
    const classification = parseRelationClassification([
      'Here is the result:',
      '{"relationType":"supports_goal","confidence":0.86,"reason":"Both notes discuss using AI tool calling to automate workflow execution.","evidence":["Current note mentions AI automation workflows","Candidate note mentions MCP tool calling"]}'
    ].join('\n'))

    expect(classification).toEqual({
      relationType: 'supports_goal',
      confidence: 0.86,
      reason: 'Both notes discuss using AI tool calling to automate workflow execution.',
      evidence: [
        'Current note mentions AI automation workflows',
        'Candidate note mentions MCP tool calling'
      ]
    })
    expect(shouldPersistRelationClassification(classification)).toBe(true)
  })

  it('fails non-JSON output to a low-confidence fallback', () => {
    const classification = parseRelationClassification('These notes seem related, but no JSON is provided.')

    expect(classification.confidence).toBe(0)
    expect(classification.evidence).toEqual([])
    expect(shouldPersistRelationClassification(classification)).toBe(false)
  })

  it('lowers confidence and blocks persistence when evidence is missing', () => {
    const classification = parseRelationClassification('{"relationType":"related_to","confidence":0.9,"reason":"They look similar.","evidence":[]}')

    expect(classification.confidence).toBeLessThan(0.4)
    expect(shouldPersistRelationClassification(classification)).toBe(false)
  })

  it('accepts evolved_from and blocked_by samples when evidence is concrete', () => {
    const evolved = parseRelationClassification('{"relationType":"evolved_from","confidence":0.72,"reason":"The current design extends the earlier prototype into a production workflow.","evidence":["Current item says production workflow","Candidate item says prototype"]}')
    const blocked = parseRelationClassification('{"relationType":"blocked_by","confidence":0.7,"reason":"The current task cannot proceed until the earlier migration problem is resolved.","evidence":["Current item says cannot proceed","Candidate item describes migration problem"]}')

    expect(evolved.relationType).toBe('evolved_from')
    expect(blocked.relationType).toBe('blocked_by')
    expect(shouldPersistRelationClassification(evolved)).toBe(true)
    expect(shouldPersistRelationClassification(blocked)).toBe(true)
  })

  it('collects streamed provider text and parses the classification', async () => {
    const provider: RelationClassifierProvider = {
      async *chatStream(_messages: ChatMessage[], _signal?: AbortSignal, _options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
        yield { type: 'text', content: '{"relationType":"blocked_by","confidence":0.68,' }
        yield { type: 'text', content: '"reason":"The current work is blocked by the earlier database migration issue.",' }
        yield { type: 'text', content: '"evidence":["Current work says blocked","Candidate describes database migration issue"]}' }
      }
    }

    const classification = await classifyRelation({
      current: { title: 'Current', content: 'Current work says blocked.' },
      candidate: { title: 'Migration', content: 'Candidate describes database migration issue.' },
      signals: ['fts_keyword:migration']
    }, { provider })

    expect(classification.relationType).toBe('blocked_by')
    expect(shouldPersistRelationClassification(classification)).toBe(true)
  })
})
