import { describe, expect, it } from 'vitest'
import type {
  IPCChannelMap,
  ProactiveSuggestion,
  ProactiveUserPrefs
} from '../packages/shared/src/types/ipc'

describe('proactive IPC types', () => {
  it('types list, respond, prefs, and debug-run-cycle channels', () => {
    const suggestion: ProactiveSuggestion = {
      id: 'sug-1',
      kind: 'relation',
      sourceRef: 'rel-1',
      entityType: 'note',
      entityId: 'note-1',
      title: 'A new high-score relation',
      body: 'You might want to revisit Note 2.',
      ctaAction: 'open_note',
      ctaPayload: { filePath: 'Note 2.md' },
      importance: 80,
      status: 'pending',
      snoozeUntil: null,
      shownAt: null,
      respondedAt: null,
      signature: 'relation|rel-1|note-1',
      createdAt: 1_800_000_000,
      updatedAt: 1_800_000_000
    }

    const listParams: IPCChannelMap['proactive:list']['params'] = {
      vaultPath: '/tmp/vault',
      status: ['pending', 'shown'],
      entityType: 'note',
      entityId: 'note-1',
      limit: 20,
      sinceSeconds: 0
    }
    const listResult: IPCChannelMap['proactive:list']['result'] = [suggestion]

    const respondParams: IPCChannelMap['proactive:respond']['params'] = {
      vaultPath: '/tmp/vault',
      id: 'sug-1',
      status: 'snoozed',
      snoozeUntil: 1_800_604_800
    }
    const respondResult: IPCChannelMap['proactive:respond']['result'] = suggestion
    const respondAllParams: IPCChannelMap['proactive:respond-all']['params'] = {
      vaultPath: '/tmp/vault',
      status: 'opened'
    }
    const respondAllResult: IPCChannelMap['proactive:respond-all']['result'] = { changed: 3 }

    const prefs: ProactiveUserPrefs = {
      enabled: true,
      silentHoursStart: '22:00',
      silentHoursEnd: '08:00',
      defaultSnoozeDays: 7,
      perKindEnabled: {
        relation: true,
        theme_link: true,
        cognitive_review: true,
        maintenance: true
      },
      maxPerDay: 5,
      importanceFloor: 30
    }
    const getPrefsResult: IPCChannelMap['proactive:get-prefs']['result'] = prefs
    const setPrefsParams: IPCChannelMap['proactive:set-prefs']['params'] = {
      prefs: { maxPerDay: 3, perKindEnabled: { relation: true, theme_link: true, cognitive_review: false, maintenance: true } }
    }
    const setPrefsResult: IPCChannelMap['proactive:set-prefs']['result'] = prefs

    const debugParams: IPCChannelMap['proactive:debug-run-cycle']['params'] = {
      vaultPath: '/tmp/vault',
      entityType: 'note',
      entityId: 'note-1',
      trigger: 'long_context_high_score'
    }
    const debugResult: IPCChannelMap['proactive:debug-run-cycle']['result'] = {
      evaluated: 1,
      emitted: 1,
      suggestions: [suggestion],
      skippedReasons: { duplicate: 0 }
    }

    expect(listParams.entityType).toBe('note')
    expect(listResult[0].kind).toBe('relation')
    expect(respondParams.status).toBe('snoozed')
    expect(respondResult?.signature).toBe('relation|rel-1|note-1')
    expect(respondAllParams.status).toBe('opened')
    expect(respondAllResult.changed).toBe(3)
    expect(getPrefsResult.maxPerDay).toBe(5)
    expect(setPrefsParams.prefs.maxPerDay).toBe(3)
    expect(setPrefsResult.enabled).toBe(true)
    expect(debugParams.trigger).toBe('long_context_high_score')
    expect(debugResult.emitted).toBe(1)
  })
})
