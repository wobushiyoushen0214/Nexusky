import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createAgentRun,
  getAgentRun,
  getAgentStep,
  getAgentStepRollbackData,
  listAgentRuns,
  updateAgentRunPlan,
  updateAgentRunStatus,
  updateAgentStep,
  type AgentPlanStep
} from '../packages/main/src/services/agent/agent-store'

function plan(): AgentPlanStep[] {
  return [
    { index: 0, kind: 'tool_call', toolName: 'list_orphan_notes', args: { limit: 5 }, description: 'list orphans', expectedEffect: 'orphan list', dependsOn: [] },
    { index: 1, kind: 'file_write', args: { filePath: 'A.md', content: 'updated' }, description: 'write A', expectedEffect: 'A updated', dependsOn: [0] }
  ]
}

describe('agent store', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-agent-store-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('createAgentRun snapshots the plan into pending steps', () => {
    const runId = createAgentRun({ vaultPath, goal: 'demo', plan: plan(), rationale: 'because' })
    const snapshot = getAgentRun(vaultPath, runId)
    expect(snapshot).not.toBeNull()
    expect(snapshot!.run.goal).toBe('demo')
    expect(snapshot!.run.totalSteps).toBe(2)
    expect(snapshot!.run.status).toBe('awaiting_user')
    expect(snapshot!.steps.map((s) => s.status)).toEqual(['pending', 'pending'])
    expect(snapshot!.steps[1].dependsOn).toEqual([0])
  })

  it('updateAgentStep persists status, preview, and result content', () => {
    const runId = createAgentRun({ vaultPath, goal: 'demo', plan: plan(), rationale: '' })
    updateAgentStep(vaultPath, runId, 0, {
      status: 'completed',
      preview: 'orphans:\n- A',
      resultContent: 'orphans:\n- A',
      startedAt: 100,
      completedAt: 110
    })
    const step = getAgentStep(vaultPath, runId, 0)!
    expect(step.status).toBe('completed')
    expect(step.preview).toBe('orphans:\n- A')
    expect(step.startedAt).toBe(100)
    expect(step.completedAt).toBe(110)
  })

  it('persists rollback data and exposes it via getAgentStepRollbackData', () => {
    const runId = createAgentRun({ vaultPath, goal: 'demo', plan: plan(), rationale: '' })
    updateAgentStep(vaultPath, runId, 1, {
      status: 'completed',
      rollbackData: { kind: 'file_write', filePath: 'A.md', previousContent: 'old' }
    })
    const step = getAgentStep(vaultPath, runId, 1)!
    expect(step.hasRollback).toBe(true)
    const rollback = getAgentStepRollbackData(vaultPath, runId, 1)
    expect(rollback).toMatchObject({ kind: 'file_write', filePath: 'A.md', previousContent: 'old' })
  })

  it('updateAgentRunPlan replaces existing step rows', () => {
    const runId = createAgentRun({ vaultPath, goal: 'demo', plan: plan(), rationale: '' })
    updateAgentRunPlan(vaultPath, runId, [
      { index: 0, kind: 'tool_call', toolName: 'list_orphan_notes', args: {}, description: 'fresh', expectedEffect: 'list', dependsOn: [] }
    ])
    const snapshot = getAgentRun(vaultPath, runId)!
    expect(snapshot.run.totalSteps).toBe(1)
    expect(snapshot.steps).toHaveLength(1)
    expect(snapshot.steps[0].description).toBe('fresh')
  })

  it('updateAgentRunStatus transitions the run lifecycle', () => {
    const runId = createAgentRun({ vaultPath, goal: 'demo', plan: plan(), rationale: '' })
    updateAgentRunStatus(vaultPath, runId, { status: 'running', currentStepIndex: 1, startedAt: 200 })
    let snapshot = getAgentRun(vaultPath, runId)!
    expect(snapshot.run.status).toBe('running')
    expect(snapshot.run.currentStepIndex).toBe(1)
    expect(snapshot.run.startedAt).toBe(200)

    updateAgentRunStatus(vaultPath, runId, { status: 'completed', completedAt: 300, resultSummary: 'ok' })
    snapshot = getAgentRun(vaultPath, runId)!
    expect(snapshot.run.status).toBe('completed')
    expect(snapshot.run.completedAt).toBe(300)
    expect(snapshot.run.resultSummary).toBe('ok')
  })

  it('listAgentRuns filters by status and orders by created_at desc', async () => {
    createAgentRun({ vaultPath, goal: 'first', plan: plan(), rationale: '' })
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const secondId = createAgentRun({ vaultPath, goal: 'second', plan: plan(), rationale: '' })
    updateAgentRunStatus(vaultPath, secondId, { status: 'completed', completedAt: 999 })

    const all = listAgentRuns(vaultPath, {})
    expect(all.map((r) => r.goal)).toEqual(['second', 'first'])

    const onlyCompleted = listAgentRuns(vaultPath, { status: ['completed'] })
    expect(onlyCompleted.map((r) => r.goal)).toEqual(['second'])
  })
})
