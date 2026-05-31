import { describe, expect, it } from 'vitest'
import { buildMaintenanceAgentGoal, getMaintenanceScanGroupsForFilter } from '../packages/renderer/src/components/maintenance/MaintenanceQueuePanel'

describe('maintenance partial scan UI helpers', () => {
  it('requests every scan group for the all filter', () => {
    expect(getMaintenanceScanGroupsForFilter('all')).toEqual([
      'links',
      'tasks',
      'properties',
      'memory',
      'structure',
      'bridge'
    ])
  })

  it('requests only the group needed by the active type filter', () => {
    expect(getMaintenanceScanGroupsForFilter('fix_unresolved_link')).toEqual(['links'])
    expect(getMaintenanceScanGroupsForFilter('review_open_tasks')).toEqual(['tasks'])
    expect(getMaintenanceScanGroupsForFilter('fill_missing_property')).toEqual(['properties'])
    expect(getMaintenanceScanGroupsForFilter('refresh_memory')).toEqual(['memory'])
    expect(getMaintenanceScanGroupsForFilter('split_large_note')).toEqual(['structure'])
    expect(getMaintenanceScanGroupsForFilter('maintain_bridge')).toEqual(['bridge'])
  })

  it('builds a scoped Agent handoff from top maintenance items', () => {
    const result = buildMaintenanceAgentGoal([
      {
        type: 'fix_unresolved_link',
        title: 'Resolve [[Missing]]',
        detail: 'Missing target',
        reason: 'Broken wikilink',
        action: 'Create [[Missing]]',
        filePath: 'A.md',
        priority: 95
      },
      {
        type: 'review_open_tasks',
        title: 'Review open task',
        detail: 'Task still open',
        reason: 'Open task',
        action: 'Mark done',
        filePath: 'Tasks.md',
        priority: 75
      }
    ])

    expect(result.goal).toContain('2 high-priority items')
    expect(result.description).toContain('preview-first')
    expect(result.description).toContain('fix_unresolved_link')
    expect(result.description).toContain('Tasks.md')
  })
})
