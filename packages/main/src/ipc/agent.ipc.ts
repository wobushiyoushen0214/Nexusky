import { ipcMain, BrowserWindow, webContents } from 'electron'
import {
  createAgentRun,
  getAgentRun,
  listAgentRuns,
  updateAgentRunPlan,
  updateAgentRunStatus,
  updateAgentStep,
  type AgentPlanStep,
  type AgentRunRecord,
  type AgentRunStatus,
  type AgentStepRecord,
  type AgentStepStatus
} from '../services/agent/agent-store'
import { planAgentRun } from '../services/agent/planner'
import { executeAgentStep, runAgentToFinish, rollbackAgentRun, rollbackAgentStep } from '../services/agent/executor'
import { reflectAgentRun } from '../services/agent/reflector'
import { ensureNonEmptyString, ensureBoundedString, MAX_DESCRIPTION_LENGTH } from './validators'
import type {
  AgentPlanStep as SharedAgentPlanStep,
  AgentRunSummary,
  AgentStepSummary,
  AgentStepUpdateEvent,
  AgentReflectResult
} from '@shared/types/ipc'

interface RunRuntime {
  controller: AbortController
  promise: Promise<void>
}

const activeRuns = new Map<string, RunRuntime>()
let pollTimer: NodeJS.Timeout | null = null
const lastBroadcastSignature = new Map<string, string>()

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function broadcastStepUpdate(event: AgentStepUpdateEvent): void {
  const targets = BrowserWindow.getAllWindows()
  for (const win of targets) {
    if (!win.isDestroyed()) win.webContents.send('agent:step-update', event)
  }
  for (const wc of webContents.getAllWebContents()) {
    if (targets.find((w) => w.webContents === wc)) continue
    if (!wc.isDestroyed()) wc.send('agent:step-update', event)
  }
}

function ensurePollLoop(vaultPath: string): void {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (activeRuns.size === 0) {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      return
    }
    for (const runId of activeRuns.keys()) {
      const snapshot = getAgentRun(vaultPath, runId)
      if (!snapshot) continue
      for (const step of snapshot.steps) {
        const signature = `${step.stepIndex}|${step.status}|${step.startedAt ?? ''}|${step.completedAt ?? ''}`
        const previous = lastBroadcastSignature.get(`${runId}#${step.stepIndex}`)
        if (previous === signature) continue
        lastBroadcastSignature.set(`${runId}#${step.stepIndex}`, signature)
        broadcastStepUpdate({
          runId,
          stepIndex: step.stepIndex,
          status: step.status,
          preview: step.preview,
          error: step.error
        })
      }
    }
  }, 250)
}

function toRunSummary(record: AgentRunRecord): AgentRunSummary {
  return {
    id: record.id,
    vaultPath: record.vaultPath,
    goal: record.goal,
    description: record.description,
    status: record.status,
    plan: record.plan,
    rationale: record.rationale,
    dryRun: record.dryRun,
    currentStepIndex: record.currentStepIndex,
    totalSteps: record.totalSteps,
    resultSummary: record.resultSummary,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt
  }
}

function toStepSummary(record: AgentStepRecord): AgentStepSummary {
  return {
    id: record.id,
    runId: record.runId,
    stepIndex: record.stepIndex,
    kind: record.kind,
    toolName: record.toolName,
    args: record.args,
    description: record.description,
    expectedEffect: record.expectedEffect,
    dependsOn: record.dependsOn,
    status: record.status,
    preview: record.preview,
    resultContent: record.resultContent,
    error: record.error,
    hasRollback: record.hasRollback,
    startedAt: record.startedAt,
    completedAt: record.completedAt
  }
}

async function startRun(vaultPath: string, runId: string, dryRun: boolean): Promise<void> {
  if (activeRuns.has(runId)) return
  const controller = new AbortController()
  ensurePollLoop(vaultPath)
  const promise = (async () => {
    try {
      const snapshot = getAgentRun(vaultPath, runId)
      if (!snapshot) return
      updateAgentRunStatus(vaultPath, runId, { status: 'running', dryRun, startedAt: snapshot.run.startedAt ?? nowSeconds() })
      await runAgentToFinish({ vaultPath, runId, signal: controller.signal })
    } finally {
      activeRuns.delete(runId)
    }
  })()
  activeRuns.set(runId, { controller, promise })
}

function isValidAgentPlanStep(step: unknown): step is AgentPlanStep {
  if (!step || typeof step !== 'object') return false
  const obj = step as Record<string, unknown>
  return typeof obj.index === 'number'
    && typeof obj.kind === 'string'
    && typeof obj.description === 'string'
    && Array.isArray(obj.dependsOn)
}

function normalizeInputPlan(steps: unknown): AgentPlanStep[] {
  if (!Array.isArray(steps)) return []
  const accepted: AgentPlanStep[] = []
  for (const item of steps) {
    if (!isValidAgentPlanStep(item)) continue
    accepted.push({
      index: accepted.length,
      kind: item.kind,
      toolName: typeof item.toolName === 'string' ? item.toolName : undefined,
      args: (item.args && typeof item.args === 'object' && !Array.isArray(item.args)) ? item.args : {},
      description: item.description,
      expectedEffect: item.expectedEffect || '',
      dependsOn: (item.dependsOn as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
    })
  }
  return accepted
}

export function registerAgentIPC(): void {
  ipcMain.handle('agent:plan', async (_event, params: {
    vaultPath: string
    goal: string
    description?: string
    context?: Record<string, unknown>
    dryRun?: boolean
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:plan.vaultPath')
    ensureNonEmptyString(params?.goal, 'agent:plan.goal', 1)
    ensureBoundedString(params?.description ?? '', 'agent:plan.description', MAX_DESCRIPTION_LENGTH)
    const { plan, rationale } = await planAgentRun({
      goal: params.goal,
      description: params.description,
      context: params.context
    })
    const runId = createAgentRun({
      vaultPath: params.vaultPath,
      goal: params.goal,
      description: params.description,
      plan,
      rationale,
      dryRun: params.dryRun !== false
    })
    return { runId, plan: plan as SharedAgentPlanStep[], rationale }
  })

  ipcMain.handle('agent:update-plan', async (_event, params: { vaultPath: string; runId: string; plan: SharedAgentPlanStep[] }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:update-plan.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:update-plan.runId')
    updateAgentRunPlan(params.vaultPath, params.runId, normalizeInputPlan(params.plan))
  })

  ipcMain.handle('agent:start', async (_event, params: { vaultPath: string; runId: string; dryRun?: boolean }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:start.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:start.runId')
    const snapshot = getAgentRun(params.vaultPath, params.runId)
    if (!snapshot) throw new Error('Invalid IPC payload: agent:start.runId not found')
    void startRun(params.vaultPath, params.runId, params.dryRun !== false)
  })

  ipcMain.handle('agent:pause', async (_event, params: { vaultPath: string; runId: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:pause.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:pause.runId')
    const runtime = activeRuns.get(params.runId)
    if (runtime) runtime.controller.abort()
    updateAgentRunStatus(params.vaultPath, params.runId, { status: 'paused', completedAt: nowSeconds() })
  })

  ipcMain.handle('agent:resume', async (_event, params: { vaultPath: string; runId: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:resume.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:resume.runId')
    const snapshot = getAgentRun(params.vaultPath, params.runId)
    if (!snapshot) return
    void startRun(params.vaultPath, params.runId, snapshot.run.dryRun)
  })

  ipcMain.handle('agent:cancel', async (_event, params: { vaultPath: string; runId: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:cancel.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:cancel.runId')
    const runtime = activeRuns.get(params.runId)
    if (runtime) runtime.controller.abort()
    updateAgentRunStatus(params.vaultPath, params.runId, { status: 'cancelled', completedAt: nowSeconds() })
  })

  ipcMain.handle('agent:retry-step', async (_event, params: { vaultPath: string; runId: string; stepIndex: number; overrideContent?: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:retry-step.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:retry-step.runId')
    if (!Number.isInteger(params?.stepIndex) || params.stepIndex < 0) {
      throw new Error('Invalid IPC payload: agent:retry-step.stepIndex must be a non-negative integer')
    }
    const snapshot = getAgentRun(params.vaultPath, params.runId)
    if (!snapshot) return { ok: false, error: 'run_not_found' }
    const step = snapshot.steps.find((s) => s.stepIndex === params.stepIndex)
    // If re-running an already-applied write, roll it back first so the original
    // baseline is restored and the user's post-run edits aren't silently
    // overwritten. The rollback's content-fingerprint guard aborts the retry if
    // the file was changed since the agent wrote it.
    if (step && step.status === 'completed' && step.hasRollback) {
      const rb = rollbackAgentStep(params.vaultPath, params.runId, params.stepIndex)
      if (!rb.ok) return { ok: false, error: rb.error || 'rollback_before_retry_failed' }
    }
    updateAgentStep(params.vaultPath, params.runId, params.stepIndex, { status: 'pending', error: null, completedAt: null })
    const result = await executeAgentStep({
      vaultPath: params.vaultPath,
      runId: params.runId,
      stepIndex: params.stepIndex,
      dryRun: snapshot.run.dryRun,
      overrides: params.overrideContent !== undefined ? { content: params.overrideContent } : undefined
    })
    return { ok: result.status !== 'failed', error: result.status === 'failed' ? result.error : undefined }
  })

  ipcMain.handle('agent:skip-step', async (_event, params: { vaultPath: string; runId: string; stepIndex: number }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:skip-step.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:skip-step.runId')
    updateAgentStep(params.vaultPath, params.runId, params.stepIndex, { status: 'skipped', completedAt: nowSeconds() })
  })

  ipcMain.handle('agent:rollback-step', async (_event, params: { vaultPath: string; runId: string; stepIndex: number }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:rollback-step.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:rollback-step.runId')
    return rollbackAgentStep(params.vaultPath, params.runId, params.stepIndex)
  })

  ipcMain.handle('agent:rollback-run', async (_event, params: { vaultPath: string; runId: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:rollback-run.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:rollback-run.runId')
    return rollbackAgentRun(params.vaultPath, params.runId)
  })

  ipcMain.handle('agent:get-run', async (_event, params: { vaultPath: string; runId: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:get-run.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:get-run.runId')
    const snapshot = getAgentRun(params.vaultPath, params.runId)
    if (!snapshot) return null
    return {
      run: toRunSummary(snapshot.run),
      steps: snapshot.steps.map(toStepSummary)
    }
  })

  ipcMain.handle('agent:list-runs', async (_event, params: { vaultPath: string; status?: AgentRunStatus[]; limit?: number }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:list-runs.vaultPath')
    return listAgentRuns(params.vaultPath, { status: params.status, limit: params.limit }).map(toRunSummary)
  })

  ipcMain.handle('agent:reflect', async (_event, params: { vaultPath: string; runId: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'agent:reflect.vaultPath')
    ensureNonEmptyString(params?.runId, 'agent:reflect.runId')
    const result = await reflectAgentRun({ vaultPath: params.vaultPath, runId: params.runId })
    return result as AgentReflectResult
  })
}

export function getActiveAgentRunIds(): string[] {
  return Array.from(activeRuns.keys())
}

export type { AgentStepUpdateEvent, AgentReflectResult }
const _unused: AgentStepStatus = 'pending'
void _unused
