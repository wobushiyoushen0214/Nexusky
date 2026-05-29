import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('previews mark_done without writing the file', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'Tasks.md'), '# Tasks\n\n- [ ] First task\n', 'utf-8')
    const result = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
      action: 'mark_done',
      mode: 'preview'
    })

    expect(result.ok).toBe(true)
    expect(result.preview?.before).toContain('- [ ] First task')
    expect(result.preview?.after).toContain('- [x] First task')
    expect(readFileSync(join(vaultPath, 'Tasks.md'), 'utf-8')).toContain('- [ ] First task')
  })

  it('undo restores the previous content when the file is unchanged after apply', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    const original = '# Tasks\n\n- [ ] First task\n'
    writeFileSync(join(vaultPath, 'Tasks.md'), original, 'utf-8')
    const applied = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
      action: 'mark_done'
    })

    expect(applied.ok).toBe(true)
    expect(applied.undoToken).toBeTruthy()
    const undone = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
      action: 'mark_done',
      mode: 'undo',
      payload: { undoToken: applied.undoToken }
    })

    expect(undone.ok).toBe(true)
    expect(readFileSync(join(vaultPath, 'Tasks.md'), 'utf-8')).toBe(original)
  })

  it('refuses expired undo records', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    const original = '# Tasks\n\n- [ ] First task\n'
    writeFileSync(join(vaultPath, 'Tasks.md'), original, 'utf-8')
    const applied = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
      action: 'mark_done'
    })

    expect(applied.ok).toBe(true)
    expect(applied.undoExpiresAt).toBeTruthy()
    vi.useFakeTimers()
    try {
      vi.setSystemTime((applied.undoExpiresAt ?? 0) + 1)
      const undone = applyMaintenanceFix({
        vaultPath,
        item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
        action: 'mark_done',
        mode: 'undo',
        payload: { undoToken: applied.undoToken }
      })

      expect(undone.ok).toBe(false)
      expect(readFileSync(join(vaultPath, 'Tasks.md'), 'utf-8')).toContain('- [x] First task')
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses to apply a stale preview after the file changes', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    writeFileSync(join(vaultPath, 'Tasks.md'), '# Tasks\n\n- [ ] First task\n', 'utf-8')
    const preview = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
      action: 'mark_done',
      mode: 'preview'
    })
    writeFileSync(join(vaultPath, 'Tasks.md'), '# Tasks\n\n- [ ] Changed elsewhere\n', 'utf-8')

    const applied = applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: 'Tasks.md', type: 'review_open_tasks' }),
      action: 'mark_done',
      payload: { expectedBeforeHash: preview.preview?.beforeHash }
    })

    expect(applied.ok).toBe(false)
    expect(readFileSync(join(vaultPath, 'Tasks.md'), 'utf-8')).toContain('Changed elsewhere')
  })

  it('undo for create_target moves the created note to the vault trash', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    const item = makeItem({
      type: 'fix_unresolved_link',
      action: 'Resolve or create [[Ghost Note]]',
      detail: 'Ghost Note'
    })
    const applied = applyMaintenanceFix({ vaultPath, item, action: 'create_target' })
    expect(applied.ok).toBe(true)
    expect(existsSync(join(vaultPath, 'Ghost Note.md'))).toBe(true)

    const undone = applyMaintenanceFix({
      vaultPath,
      item,
      action: 'create_target',
      mode: 'undo',
      payload: { undoToken: applied.undoToken }
    })

    expect(undone.ok).toBe(true)
    expect(existsSync(join(vaultPath, 'Ghost Note.md'))).toBe(false)
    expect(readdirSync(join(vaultPath, '.trash')).some((entry) => entry.endsWith('_Ghost Note.md'))).toBe(true)
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

  it('rejects item paths outside the vault', async () => {
    const { applyMaintenanceFix } = await import('../packages/main/src/services/maintenance/apply-fix')
    expect(() => applyMaintenanceFix({
      vaultPath,
      item: makeItem({ filePath: '../outside.md' }),
      action: 'open_note'
    })).toThrow(/outside/)
  })
})
