import { describe, expect, it } from 'vitest'
import type {
  AgentPlanStep,
  AgentReflectResult,
  AgentRunSummary,
  AgentStepSummary,
  AgentStepUpdateEvent,
  IPCChannelMap,
  LongContextInspection,
  LongContextPackItemPayload,
  LongContextUserPrefs
} from '../packages/shared/src/types/ipc'

describe('agent + long-context IPC channel types', () => {
  it('types the agent:plan / start / step lifecycle', () => {
    const planParams: IPCChannelMap['agent:plan']['params'] = {
      vaultPath: '/tmp/vault',
      goal: 'Generate missing memories',
      description: 'limit to .nexusky/memories',
      dryRun: true
    }
    const planStep: AgentPlanStep = {
      index: 0,
      kind: 'tool_call',
      toolName: 'list_notes_missing_memory',
      args: { limit: 10 },
      description: 'list missing memories',
      expectedEffect: 'array of note paths',
      dependsOn: []
    }
    const planResult: IPCChannelMap['agent:plan']['result'] = {
      runId: 'run-1',
      plan: [planStep],
      rationale: 'gather first then act'
    }
    const startParams: IPCChannelMap['agent:start']['params'] = { vaultPath: '/tmp/vault', runId: 'run-1', dryRun: true }
    const pauseParams: IPCChannelMap['agent:pause']['params'] = { vaultPath: '/tmp/vault', runId: 'run-1' }
    const retryParams: IPCChannelMap['agent:retry-step']['params'] = { vaultPath: '/tmp/vault', runId: 'run-1', stepIndex: 0, overrideContent: '...' }
    const rollbackParams: IPCChannelMap['agent:rollback-run']['params'] = { vaultPath: '/tmp/vault', runId: 'run-1' }
    const rollbackResult: IPCChannelMap['agent:rollback-run']['result'] = { ok: true, rolledBack: 2, errors: [] }
    const updateParams: IPCChannelMap['agent:update-plan']['params'] = { vaultPath: '/tmp/vault', runId: 'run-1', plan: [planStep] }
    const skipParams: IPCChannelMap['agent:skip-step']['params'] = { vaultPath: '/tmp/vault', runId: 'run-1', stepIndex: 0 }

    expect(planParams.goal).toContain('memories')
    expect(planResult.plan[0].toolName).toBe('list_notes_missing_memory')
    expect(startParams.dryRun).toBe(true)
    expect(pauseParams.runId).toBe('run-1')
    expect(retryParams.overrideContent).toBe('...')
    expect(rollbackResult.rolledBack).toBe(2)
    expect(updateParams.plan[0].kind).toBe('tool_call')
    expect(skipParams.stepIndex).toBe(0)
  })

  it('types agent:get-run / list-runs / reflect payloads', () => {
    const runSummary: AgentRunSummary = {
      id: 'run-1',
      vaultPath: '/tmp/vault',
      goal: 'g',
      description: 'd',
      status: 'completed',
      plan: [],
      rationale: '',
      dryRun: true,
      currentStepIndex: 1,
      totalSteps: 2,
      resultSummary: null,
      error: null,
      createdAt: 100,
      updatedAt: 200,
      startedAt: 110,
      completedAt: 190
    }
    const stepSummary: AgentStepSummary = {
      id: 'step-1',
      runId: 'run-1',
      stepIndex: 0,
      kind: 'tool_call',
      toolName: 'search_notes',
      args: {},
      description: 'd',
      expectedEffect: 'e',
      dependsOn: [],
      status: 'completed',
      preview: 'p',
      resultContent: 'r',
      error: null,
      hasRollback: false,
      startedAt: 110,
      completedAt: 120
    }
    const getResult: IPCChannelMap['agent:get-run']['result'] = { run: runSummary, steps: [stepSummary] }
    const listResult: IPCChannelMap['agent:list-runs']['result'] = [runSummary]
    const reflectResult: AgentReflectResult = {
      goalAchieved: true,
      succeededSteps: 2,
      failedSteps: 0,
      unmetExpectations: [],
      suggestions: []
    }
    const event: AgentStepUpdateEvent = {
      runId: 'run-1',
      stepIndex: 0,
      status: 'running',
      preview: null,
      error: null
    }

    expect(getResult?.steps[0].status).toBe('completed')
    expect(listResult[0].status).toBe('completed')
    expect(reflectResult.goalAchieved).toBe(true)
    expect(event.status).toBe('running')
  })

  it('types long-context prefs + inspection + citation lookup', () => {
    const prefs: LongContextUserPrefs = {
      confidenceThreshold: 0.65,
      tokenBudget: 1200,
      hotRatio: 0.5,
      warmRatio: 0.3,
      coldRatio: 0.2,
      decayHalfLifeDays: 90,
      topN: 3,
      hotLimit: 3,
      warmLimit: 3,
      coldLimit: 3,
      archiveAfterDays: 180
    }
    const getPrefsResult: IPCChannelMap['long-context:get-prefs']['result'] = prefs
    const setPrefsParams: IPCChannelMap['long-context:set-prefs']['params'] = { prefs: { confidenceThreshold: 0.5 } }

    const packItem: LongContextPackItemPayload = {
      tier: 'hot',
      relationId: 'rel-1',
      title: 'A',
      source: 'A.md',
      relationType: 'related_to',
      confidence: 0.7,
      score: 0.66,
      reason: 'topic overlap',
      evidence: ['ev1'],
      droppedReason: undefined
    }
    const inspection: LongContextInspection = {
      pack: {
        hot: [packItem],
        warm: [],
        cold: [],
        estimatedTokens: 100,
        tokenBudget: 1200,
        droppedItems: []
      },
      currentFilePath: 'A.md',
      generatedAt: 1
    }
    const inspectResult: IPCChannelMap['long-context:inspect-pack']['result'] = inspection
    const lookupParams: IPCChannelMap['long-context:lookup-citation']['params'] = {
      vaultPath: '/tmp/vault',
      sourceFilePath: 'A.md',
      sourceTitle: 'A'
    }
    const lookupResult: IPCChannelMap['long-context:lookup-citation']['result'] = {
      found: true,
      relations: [],
      themes: []
    }

    expect(getPrefsResult.tokenBudget).toBe(1200)
    expect(setPrefsParams.prefs.confidenceThreshold).toBe(0.5)
    expect(inspectResult.pack.hot[0].tier).toBe('hot')
    expect(lookupParams.sourceTitle).toBe('A')
    expect(lookupResult.found).toBe(true)
  })
})
