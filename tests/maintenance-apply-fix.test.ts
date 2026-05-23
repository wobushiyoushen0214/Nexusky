import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { KnowledgeMaintenanceItem } from '../packages/shared/src/types/ipc'

function makeItem(over: Partial<KnowledgeMaintenanceItem> = {}): KnowledgeMaintenanceItem {
  return {
    type: 'review_open_tasks',
    title: 'Demo',
    filePath: 'Demo.md',
    priority: 70,
    action: 'review',
    reason: 'demo',
    detail: 'demo',
    ...over
  }
}

describe('applyMaintenanceFix', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-maintenance-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('open_note succeeds when the file exists', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'Demo.md'), '# Demo\n', 'utf-8')
    const result = applyMaintenanceFix({ vaultPath, item: makeItem(), action: 'open_note' })
    expect(result.ok).toBe(true)
    expect(result.filePath).toBe('Demo.md')
  })

  it('open_note reports an error when the file is missing', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    const result = applyMaintenanceFix({ vaultPath, item: makeItem({ filePath: 'Missing.md' }), action: 'open_note' })
    expect(result.ok).toBe(false)
  })

  it('create_target writes a new note when the title is unique', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ type: 'fix_unresolved_link' }),
      action: 'create_target',
      payload: { targetTitle: 'New Note' }
    })
    expect(result.ok).toBe(true)
    expect(result.filePath).toBe('New Note.md')
    expect(readFileSync(join(vaultPath, 'New Note.md'), 'utf-8')).toContain('# New Note')
  })

  it('create_target rejects when the note already exists', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'Existing.md'), '# Existing\n', 'utf-8')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ type: 'fix_unresolved_link' }),
      action: 'create_target',
      payload: { targetTitle: 'Existing' }
    })
    expect(result.ok).toBe(false)
  })

  it('mark_done flips the first open task box', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'Tasks.md'), '# Tasks\n\n- [ ] Buy milk\n- [ ] Email Alice\n', 'utf-8')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
      action: 'mark_done'
    })
    expect(result.ok).toBe(true)
    const updated = readFileSync(join(vaultPath, 'Tasks.md'), 'utf-8')
    expect(updated).toContain('- [x] Buy milk')
    expect(updated).toContain('- [ ] Email Alice')
  })

  it('mark_done with taskText targets a specific task line', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'Tasks.md'), '# Tasks\n\n- [ ] First task\n- [ ] Second task\n', 'utf-8')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
      action: 'mark_done',
      payload: { taskText: 'Second task' }
    })
    expect(result.ok).toBe(true)
    const updated = readFileSync(join(vaultPath, 'Tasks.md'), 'utf-8')
    expect(updated).toContain('- [ ] First task')
    expect(updated).toContain('- [x] Second task')
  })

  it('archive sets frontmatter.archived to true', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'A.md'), '---\ntitle: A\n---\n\n# A\n', 'utf-8')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'A.md' }),
      action: 'archive'
    })
    expect(result.ok).toBe(true)
    const updated = readFileSync(join(vaultPath, 'A.md'), 'utf-8')
    expect(updated).toMatch(/archived:\s*true/)
    expect(updated).toMatch(/title:\s*A/)
  })

  it('archive refuses to re-archive an already-archived note', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'A.md'), '---\narchived: true\n---\n\n# A\n', 'utf-8')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'A.md' }),
      action: 'archive'
    })
    expect(result.ok).toBe(false)
  })

  it('add_alias appends to existing aliases without dropping siblings', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'A.md'), '---\ntitle: A\naliases:\n  - first\n---\n\n# A\n', 'utf-8')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'A.md' }),
      action: 'add_alias',
      payload: { alias: 'second' }
    })
    expect(result.ok).toBe(true)
    const updated = readFileSync(join(vaultPath, 'A.md'), 'utf-8')
    expect(updated).toMatch(/first/)
    expect(updated).toMatch(/second/)
    expect(updated).toMatch(/title:\s*A/)
  })

  it('add_alias rejects duplicates', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'A.md'), '---\naliases:\n  - alpha\n---\n', 'utf-8')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'A.md' }),
      action: 'add_alias',
      payload: { alias: 'alpha' }
    })
    expect(result.ok).toBe(false)
  })

  it('returns an error for unknown actions', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem(),
      action: 'something_else' as never
    })
    expect(result.ok).toBe(false)
  })
})
