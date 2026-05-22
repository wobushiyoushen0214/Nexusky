import { describe, expect, it } from 'vitest'
import type { IPCChannelMap, LongContextSuggestion } from '../packages/shared/src/types/ipc'

describe('long-context IPC types', () => {
  it('types suggestion, discovery, and feedback channels', () => {
    const suggestion: LongContextSuggestion = {
      relationId: 'rel-1',
      targetType: 'note',
      targetId: 'note-2',
      targetTitle: 'Historical Context',
      targetPath: 'Historical Context.md',
      relationType: 'supports_goal',
      confidence: 0.82,
      score: 0.76,
      reason: 'Both notes describe the same automation goal.',
      evidence: ['Current note mentions automation', 'Historical note mentions tool calling'],
      lastSeenAt: 1_800_000_000
    }

    const getParams: IPCChannelMap['long-context:get-suggestions']['params'] = {
      vaultPath: '/tmp/vault',
      entityType: 'note',
      entityId: 'note-1',
      content: 'Current content',
      limit: 3,
      refresh: true
    }
    const getResult: IPCChannelMap['long-context:get-suggestions']['result'] = [suggestion]
    const discoverResult: IPCChannelMap['long-context:discover-relations']['result'] = {
      discovered: 1,
      suggestions: getResult
    }
    const feedbackParams: IPCChannelMap['long-context:submit-feedback']['params'] = {
      vaultPath: '/tmp/vault',
      relationId: 'rel-1',
      feedbackType: 'useful',
      note: 'Good context'
    }

    expect(getParams.entityType).toBe('note')
    expect(discoverResult.suggestions[0].relationType).toBe('supports_goal')
    expect(feedbackParams.feedbackType).toBe('useful')
  })
})
