import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { getDatabase } from '../database'

export type AgentRunStatus =
  | 'pending'
  | 'planning'
  | 'awaiting_user'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentStepKind = 'tool_call' | 'file_write' | 'file_create' | 'task_update' | 'note_edit'

export type AgentStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'rolled_back'

export interface AgentPlanStep {
  index: number
  kind: AgentStepKind
  toolName?: string
  args: Record<string, unknown>
  description: string
  expectedEffect: string
  dependsOn: number[]
}

export interface AgentRunRecord {
  id: string
  vaultPath: string
  goal: string
  description: string
  status: AgentRunStatus
  plan: AgentPlanStep[]
  rationale: string
  dryRun: boolean
  currentStepIndex: number
  totalSteps: number
  resultSummary: string | null
  error: string | null
  createdAt: number
  updatedAt: number
  startedAt: number | null
  completedAt: number | null
}

export interface AgentStepRecord {
  id: string
  runId: string
  stepIndex: number
  kind: AgentStepKind
  toolName: string | null
  args: Record<string, unknown>
  description: string
  expectedEffect: string
  dependsOn: number[]
  status: AgentStepStatus
  preview: string | null
  resultContent: string | null
  resultSources: unknown[] | null
  error: string | null
  hasRollback: boolean
  startedAt: number | null
  completedAt: number | null
}

interface AgentRunRow {
  id: string
  vault_path: string
  goal: string
  description: string
  status: AgentRunStatus
  plan_json: string
  rationale: string
  dry_run: number
  current_step_index: number
  total_steps: number
  result_summary: string | null
  error: string | null
  created_at: number
  updated_at: number
  started_at: number | null
  completed_at: number | null
}

interface AgentStepRow {
  id: string
  run_id: string
  step_index: number
  step_kind: AgentStepKind
  tool_name: string | null
  args_json: string
  description: string
  expected_effect: string
  depends_on_json: string
  status: AgentStepStatus
  preview: string | null
  result_content: string | null
  result_sources_json: string | null
  error: string | null
  rollback_data_json: string | null
  started_at: number | null
  completed_at: number | null
}

export interface CreateAgentRunInput {
  vaultPath: string
  goal: string
  description?: string
  plan: AgentPlanStep[]
  rationale: string
  dryRun?: boolean
}

export function createAgentRun(input: CreateAgentRunInput): string {
  const db = getDatabase(input.vaultPath)
  const id = randomUUID()
  const now = nowSeconds()
  db.prepare(`
    INSERT INTO agent_runs (
      id, vault_path, goal, description, status, plan_json, rationale,
      dry_run, current_step_index, total_steps, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'awaiting_user', ?, ?, ?, 0, ?, ?, ?)
  `).run(
    id,
    input.vaultPath,
    input.goal,
    input.description || '',
    JSON.stringify(input.plan),
    input.rationale,
    input.dryRun === false ? 0 : 1,
    input.plan.length,
    now,
    now
  )
  insertStepsFromPlan(db, id, input.plan)
  return id
}

export function updateAgentRunPlan(vaultPath: string, runId: string, plan: AgentPlanStep[]): void {
  const db = getDatabase(vaultPath)
  const now = nowSeconds()
  db.prepare(`
    UPDATE agent_runs SET plan_json = ?, total_steps = ?, updated_at = ? WHERE id = ?
  `).run(JSON.stringify(plan), plan.length, now, runId)
  db.prepare('DELETE FROM agent_steps WHERE run_id = ?').run(runId)
  insertStepsFromPlan(db, runId, plan)
}

export interface UpdateAgentRunStatusInput {
  status: AgentRunStatus
  dryRun?: boolean
  currentStepIndex?: number
  resultSummary?: string | null
  error?: string | null
  startedAt?: number | null
  completedAt?: number | null
}

export function updateAgentRunStatus(vaultPath: string, runId: string, input: UpdateAgentRunStatusInput): void {
  const db = getDatabase(vaultPath)
  const now = nowSeconds()
  const sets: string[] = ['status = ?', 'updated_at = ?']
  const args: unknown[] = [input.status, now]
  if (typeof input.dryRun === 'boolean') {
    sets.push('dry_run = ?')
    args.push(input.dryRun ? 1 : 0)
  }
  if (typeof input.currentStepIndex === 'number') {
    sets.push('current_step_index = ?')
    args.push(input.currentStepIndex)
  }
  if (input.resultSummary !== undefined) {
    sets.push('result_summary = ?')
    args.push(input.resultSummary)
  }
  if (input.error !== undefined) {
    sets.push('error = ?')
    args.push(input.error)
  }
  if (input.startedAt !== undefined) {
    sets.push('started_at = ?')
    args.push(input.startedAt)
  }
  if (input.completedAt !== undefined) {
    sets.push('completed_at = ?')
    args.push(input.completedAt)
  }
  args.push(runId)
  db.prepare(`UPDATE agent_runs SET ${sets.join(', ')} WHERE id = ?`).run(...args)
}

export interface UpdateAgentStepInput {
  status?: AgentStepStatus
  preview?: string | null
  resultContent?: string | null
  resultSources?: unknown[] | null
  error?: string | null
  rollbackData?: Record<string, unknown> | null
  startedAt?: number | null
  completedAt?: number | null
}

export function updateAgentStep(vaultPath: string, runId: string, stepIndex: number, input: UpdateAgentStepInput): void {
  const db = getDatabase(vaultPath)
  const now = nowSeconds()
  const sets: string[] = ['updated_at = ?']
  const args: unknown[] = [now]
  if (input.status !== undefined) {
    sets.push('status = ?')
    args.push(input.status)
  }
  if (input.preview !== undefined) {
    sets.push('preview = ?')
    args.push(input.preview)
  }
  if (input.resultContent !== undefined) {
    sets.push('result_content = ?')
    args.push(input.resultContent)
  }
  if (input.resultSources !== undefined) {
    sets.push('result_sources_json = ?')
    args.push(input.resultSources === null ? null : JSON.stringify(input.resultSources))
  }
  if (input.error !== undefined) {
    sets.push('error = ?')
    args.push(input.error)
  }
  if (input.rollbackData !== undefined) {
    sets.push('rollback_data_json = ?')
    args.push(input.rollbackData === null ? null : JSON.stringify(input.rollbackData))
  }
  if (input.startedAt !== undefined) {
    sets.push('started_at = ?')
    args.push(input.startedAt)
  }
  if (input.completedAt !== undefined) {
    sets.push('completed_at = ?')
    args.push(input.completedAt)
  }
  args.push(runId, stepIndex)
  db.prepare(`UPDATE agent_steps SET ${sets.join(', ')} WHERE run_id = ? AND step_index = ?`).run(...args)
}

export function getAgentRun(vaultPath: string, runId: string): { run: AgentRunRecord; steps: AgentStepRecord[] } | null {
  const db = getDatabase(vaultPath)
  const runRow = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as AgentRunRow | undefined
  if (!runRow) return null
  const stepRows = db.prepare('SELECT * FROM agent_steps WHERE run_id = ? ORDER BY step_index ASC').all(runId) as AgentStepRow[]
  return { run: toRunRecord(runRow), steps: stepRows.map(toStepRecord) }
}

export function listAgentRuns(vaultPath: string, options: { status?: AgentRunStatus[]; limit?: number } = {}): AgentRunRecord[] {
  const db = getDatabase(vaultPath)
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
  if (options.status && options.status.length > 0) {
    const placeholders = options.status.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT * FROM agent_runs
      WHERE vault_path = ? AND status IN (${placeholders})
      ORDER BY created_at DESC LIMIT ?
    `).all(vaultPath, ...options.status, limit) as AgentRunRow[]
    return rows.map(toRunRecord)
  }
  const rows = db.prepare(`
    SELECT * FROM agent_runs
    WHERE vault_path = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(vaultPath, limit) as AgentRunRow[]
  return rows.map(toRunRecord)
}

export function getAgentStep(vaultPath: string, runId: string, stepIndex: number): AgentStepRecord | null {
  const db = getDatabase(vaultPath)
  const row = db.prepare('SELECT * FROM agent_steps WHERE run_id = ? AND step_index = ?').get(runId, stepIndex) as AgentStepRow | undefined
  return row ? toStepRecord(row) : null
}

export function getAgentStepRollbackData(vaultPath: string, runId: string, stepIndex: number): Record<string, unknown> | null {
  const db = getDatabase(vaultPath)
  const row = db.prepare('SELECT rollback_data_json FROM agent_steps WHERE run_id = ? AND step_index = ?').get(runId, stepIndex) as { rollback_data_json: string | null } | undefined
  if (!row?.rollback_data_json) return null
  try {
    const parsed = JSON.parse(row.rollback_data_json) as unknown
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function insertStepsFromPlan(db: Database.Database, runId: string, plan: AgentPlanStep[]): void {
  const insert = db.prepare(`
    INSERT INTO agent_steps (
      id, run_id, step_index, step_kind, tool_name, args_json,
      description, expected_effect, depends_on_json, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `)
  const now = nowSeconds()
  const tx = db.transaction(() => {
    for (const step of plan) {
      insert.run(
        randomUUID(),
        runId,
        step.index,
        step.kind,
        step.toolName ?? null,
        JSON.stringify(step.args || {}),
        step.description || '',
        step.expectedEffect || '',
        JSON.stringify(step.dependsOn || []),
        now,
        now
      )
    }
  })
  tx()
}

function toRunRecord(row: AgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    vaultPath: row.vault_path,
    goal: row.goal,
    description: row.description,
    status: row.status,
    plan: safeParsePlan(row.plan_json),
    rationale: row.rationale,
    dryRun: row.dry_run === 1,
    currentStepIndex: row.current_step_index,
    totalSteps: row.total_steps,
    resultSummary: row.result_summary,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  }
}

function toStepRecord(row: AgentStepRow): AgentStepRecord {
  return {
    id: row.id,
    runId: row.run_id,
    stepIndex: row.step_index,
    kind: row.step_kind,
    toolName: row.tool_name,
    args: safeParseObject(row.args_json),
    description: row.description,
    expectedEffect: row.expected_effect,
    dependsOn: safeParseNumberArray(row.depends_on_json),
    status: row.status,
    preview: row.preview,
    resultContent: row.result_content,
    resultSources: safeParseUnknownArray(row.result_sources_json),
    error: row.error,
    hasRollback: Boolean(row.rollback_data_json),
    startedAt: row.started_at,
    completedAt: row.completed_at
  }
}

function safeParsePlan(json: string): AgentPlanStep[] {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isAgentPlanStep)
  } catch {
    return []
  }
}

function safeParseObject(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function safeParseNumberArray(json: string): number[] {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => Number(item)).filter((n) => Number.isFinite(n))
  } catch {
    return []
  }
}

function safeParseUnknownArray(json: string | null): unknown[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isAgentPlanStep(value: unknown): value is AgentPlanStep {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return typeof obj.index === 'number'
    && typeof obj.kind === 'string'
    && typeof obj.description === 'string'
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
