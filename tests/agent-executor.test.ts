import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAgentRun, getAgentStep, type AgentPlanStep } from '../packages/main/src/services/agent/agent-store'
import { executeAgentStep, rollbackAgentStep } from '../packages/main/src/services/agent/executor'

function planWithRead(extra: AgentPlanStep[] = []): AgentPlanStep[] {
  return [
    { index: 0, kind: 'tool_call', toolName: 'list_orphan_notes', args: {}, description: 'read', expectedEffect: 'list', dependsOn: [] },
    ...extra.map((step, i) => ({ ...step, index: i + 1 }))
  ]
}

describe('agent executor', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-agent-executor-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('file_create dryRun produces a preview without writing the file', async () => {
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_create', args: { filePath: 'new.md', content: '# new' }, description: 'create new note', expectedEffect: 'new.md exists', dependsOn: [0] }]),
      rationale: ''
    })
    // Mark step 0 (the read) as completed so executor's dependency check passes
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    const result = await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: true })
    expect(result.status).toBe('completed')
    expect(result.preview).toContain('Create file')
    expect(existsSync(join(vaultPath, 'new.md'))).toBe(false)

    const step = getAgentStep(vaultPath, runId, 1)!
    expect(step.hasRollback).toBe(false)
  })

  it('file_create real mode writes the file and records rollback data', async () => {
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_create', args: { filePath: 'fresh.md', content: 'hello' }, description: 'fresh', expectedEffect: 'fresh.md', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    const result = await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false })
    expect(result.status).toBe('completed')
    expect(readFileSync(join(vaultPath, 'fresh.md'), 'utf-8')).toBe('hello')

    const step = getAgentStep(vaultPath, runId, 1)!
    expect(step.hasRollback).toBe(true)
  })

  it('file_create rollback deletes the created file and clears its index', async () => {
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_create', args: { filePath: 'rollback.md', content: '# title\n\nbody' }, description: 'create', expectedEffect: 'rollback.md', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false })
    expect(existsSync(join(vaultPath, 'rollback.md'))).toBe(true)
    const { getAllNotes } = await import('../packages/main/src/services/indexer')
    expect(getAllNotes(vaultPath).some((n) => n.filePath === 'rollback.md')).toBe(true)

    const rollback = rollbackAgentStep(vaultPath, runId, 1)
    expect(rollback.ok).toBe(true)
    expect(existsSync(join(vaultPath, 'rollback.md'))).toBe(false)
    expect(getAllNotes(vaultPath).some((n) => n.filePath === 'rollback.md')).toBe(false)
    const step = getAgentStep(vaultPath, runId, 1)!
    expect(step.status).toBe('rolled_back')
  })

  it('file_write dryRun emits a diff preview without modifying the file', async () => {
    writeFileSync(join(vaultPath, 'A.md'), 'original\n', 'utf-8')
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_write', args: { filePath: 'A.md', content: 'replaced\n' }, description: 'write A', expectedEffect: 'A updated', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    const result = await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: true })
    expect(result.status).toBe('completed')
    expect(result.preview).toContain('Diff @ A.md')
    expect(readFileSync(join(vaultPath, 'A.md'), 'utf-8')).toBe('original\n')
  })

  it('file_write real mode writes the file and rolling back restores the previous content', async () => {
    writeFileSync(join(vaultPath, 'A.md'), 'before', 'utf-8')
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_write', args: { filePath: 'A.md', content: 'after' }, description: 'write A', expectedEffect: 'A updated', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    const result = await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false })
    expect(result.status).toBe('completed')
    expect(readFileSync(join(vaultPath, 'A.md'), 'utf-8')).toBe('after')

    const rollback = rollbackAgentStep(vaultPath, runId, 1)
    expect(rollback.ok).toBe(true)
    expect(readFileSync(join(vaultPath, 'A.md'), 'utf-8')).toBe('before')

    const step = getAgentStep(vaultPath, runId, 1)!
    expect(step.status).toBe('rolled_back')
  })

  it('task_update flips the checkbox at the specified 1-based line', async () => {
    const initial = '# Tasks\n- [ ] todo one\n- [ ] todo two\n'
    writeFileSync(join(vaultPath, 'Tasks.md'), initial, 'utf-8')
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'task_update', args: { filePath: 'Tasks.md', line: 2, action: 'mark_done' }, description: 'mark line 2 done', expectedEffect: 'task closed', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    const result = await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false })
    expect(result.status).toBe('completed')
    const updated = readFileSync(join(vaultPath, 'Tasks.md'), 'utf-8').split('\n')
    expect(updated[1]).toBe('- [x] todo one')
    expect(updated[2]).toBe('- [ ] todo two')

    const rollback = rollbackAgentStep(vaultPath, runId, 1)
    expect(rollback.ok).toBe(true)
    const restored = readFileSync(join(vaultPath, 'Tasks.md'), 'utf-8').split('\n')
    expect(restored[1]).toBe('- [ ] todo one')
  })

  it('file_write on a missing file fails without touching disk', async () => {
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_write', args: { filePath: 'Missing.md', content: 'x' }, description: 'write missing', expectedEffect: 'should fail', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    const result = await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('file_not_found')
  })

  it('rejects path traversal that escapes the vault', async () => {
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_create', args: { filePath: '../escape.md', content: 'x' }, description: 'escape', expectedEffect: 'oops', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    const result = await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('invalid_target_path')
  })

  it('aborts a step when the signal is already aborted', async () => {
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_create', args: { filePath: 'B.md', content: 'x' }, description: 'create B', expectedEffect: 'B exists', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })

    const controller = new AbortController()
    controller.abort()
    const result = await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false, signal: controller.signal })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('aborted')
    expect(existsSync(join(vaultPath, 'B.md'))).toBe(false)
  })

  it('file_create rollback refuses to delete a file the user edited after creation', async () => {
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_create', args: { filePath: 'guard.md', content: 'agent original' }, description: 'create', expectedEffect: 'guard.md', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })
    await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false })

    // The user edits the agent-created file before rolling back.
    writeFileSync(join(vaultPath, 'guard.md'), 'user added important notes', 'utf-8')

    const rollback = rollbackAgentStep(vaultPath, runId, 1)
    expect(rollback.ok).toBe(false)
    expect(rollback.error).toBe('file_modified_since_create')
    // The user's edit must survive — the file is NOT deleted.
    expect(readFileSync(join(vaultPath, 'guard.md'), 'utf-8')).toBe('user added important notes')
  })

  it('file_write rollback refuses to overwrite edits the user made after the agent wrote', async () => {
    writeFileSync(join(vaultPath, 'W.md'), 'before', 'utf-8')
    const runId = createAgentRun({
      vaultPath,
      goal: 'g',
      plan: planWithRead([{ index: 0, kind: 'file_write', args: { filePath: 'W.md', content: 'agent version' }, description: 'write', expectedEffect: 'W updated', dependsOn: [0] }]),
      rationale: ''
    })
    const { updateAgentStep } = await import('../packages/main/src/services/agent/agent-store')
    updateAgentStep(vaultPath, runId, 0, { status: 'completed' })
    await executeAgentStep({ vaultPath, runId, stepIndex: 1, dryRun: false })
    expect(readFileSync(join(vaultPath, 'W.md'), 'utf-8')).toBe('agent version')

    // The user edits the file after the agent wrote it.
    writeFileSync(join(vaultPath, 'W.md'), 'user precious edit', 'utf-8')

    const rollback = rollbackAgentStep(vaultPath, runId, 1)
    expect(rollback.ok).toBe(false)
    expect(rollback.error).toBe('file_modified_since_write')
    expect(readFileSync(join(vaultPath, 'W.md'), 'utf-8')).toBe('user precious edit')
  })
})
