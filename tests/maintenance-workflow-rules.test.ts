import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../packages/main/src/services/database'
import { indexNote } from '../packages/main/src/services/indexer'
import { gatherMaintenanceItems } from '../packages/main/src/services/maintenance/queue-builder'
import { isPathIgnoredByWorkflowRules, readMaintenanceWorkflowRules } from '../packages/main/src/services/maintenance/workflow-rules'

describe('maintenance workflow rules', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-maintenance-rules-'))
    mkdirSync(join(vaultPath, 'Maintenance'), { recursive: true })
    mkdirSync(join(vaultPath, 'Archive'), { recursive: true })
    mkdirSync(join(vaultPath, 'Notes'), { recursive: true })
  })

  afterEach(() => {
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('parses machine-readable frontmatter and Markdown sections', () => {
    writeFileSync(join(vaultPath, 'Maintenance', 'Workflow Rules.md'), [
      '---',
      'title: Workflow Rules',
      'type: maintenance-rules',
      'maintenance:',
      '  requiredProperties: [type, status]',
      '  ignorePaths:',
      '    - Archive/**',
      '  minCharacters: 3000',
      '  upcomingDays: 10',
      '---',
      '# Workflow Rules',
      '',
      '## Required Properties',
      '- owner',
      '',
      '## Ignore Paths',
      '- Drafts/**',
      '- Private'
    ].join('\n'), 'utf-8')

    const rules = readMaintenanceWorkflowRules(vaultPath)

    expect(rules.requiredProperties).toEqual(['type', 'status', 'owner'])
    expect(rules.ignorePaths).toEqual(['Archive/**', 'Drafts/**', 'Private'])
    expect(rules.minCharacters).toBe(3000)
    expect(rules.upcomingDays).toBe(10)
    expect(rules.sourceFiles).toEqual(['Maintenance/Workflow Rules.md'])
    expect(rules.signature).toMatch(/^1:/)
    expect(isPathIgnoredByWorkflowRules('Archive/Old.md', rules.ignorePaths)).toBe(true)
    expect(isPathIgnoredByWorkflowRules('Drafts/Idea.md', rules.ignorePaths)).toBe(true)
    expect(isPathIgnoredByWorkflowRules('Private/Secret.md', rules.ignorePaths)).toBe(true)
    expect(isPathIgnoredByWorkflowRules('Notes/Idea.md', rules.ignorePaths)).toBe(false)
  })

  it('drives required property, long note, and ignored path maintenance items', () => {
    const rulesPath = join(vaultPath, 'Maintenance', 'Workflow Rules.md')
    const ideaPath = join(vaultPath, 'Notes', 'Idea.md')
    const longPath = join(vaultPath, 'Notes', 'Long.md')
    const archivedPath = join(vaultPath, 'Archive', 'Old.md')

    writeFileSync(rulesPath, [
      '---',
      'title: Workflow Rules',
      'type: maintenance-rules',
      'status: active',
      'tags: [workflow]',
      'maintenance:',
      '  requiredProperties:',
      '    - type',
      '    - status',
      '    - tags',
      '  ignorePaths:',
      '    - Archive/**',
      '  minCharacters: 1200',
      '---',
      '# Workflow Rules'
    ].join('\n'), 'utf-8')
    writeFileSync(ideaPath, [
      '---',
      'title: Idea',
      '---',
      '# Idea',
      '',
      'Captured without the workflow template.'
    ].join('\n'), 'utf-8')
    writeFileSync(longPath, [
      '---',
      'title: Long',
      'type: note',
      'status: draft',
      'tags: [research]',
      '---',
      '# Long',
      '',
      'A'.repeat(1300)
    ].join('\n'), 'utf-8')
    writeFileSync(archivedPath, [
      '---',
      'title: Old',
      '---',
      '# Old',
      '',
      'This note is ignored by workflow rules.'
    ].join('\n'), 'utf-8')

    for (const filePath of [rulesPath, ideaPath, longPath, archivedPath]) {
      indexNote(vaultPath, filePath)
    }

    const result = gatherMaintenanceItems({
      vaultPath,
      scanGroups: ['properties', 'structure'],
      limit: 20,
      language: 'en'
    })

    const missing = result.items.find((item) => item.type === 'fill_missing_property' && item.filePath === 'Notes/Idea.md')
    expect(missing).toMatchObject({
      action: 'Fill missing properties: type, status, tags',
      detail: 'Missing properties: type, status, tags'
    })
    expect(missing?.reason).toContain('Workflow Rules require these properties')
    expect(result.items.some((item) => item.filePath === 'Archive/Old.md')).toBe(false)
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'split_large_note',
        filePath: 'Notes/Long.md'
      })
    ]))
  })
})
