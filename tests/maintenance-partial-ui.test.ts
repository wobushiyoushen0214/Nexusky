import { describe, expect, it } from 'vitest'
import {
  buildMaintenanceAgentGoal,
  getMaintenanceGroupCount,
  getMaintenanceScanGroupsForFilter,
  getMaintenanceScanGroupsForSelection
} from '../packages/renderer/src/components/maintenance/MaintenanceQueuePanel'

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

  it('requests a selected scan group when no specific type is active', () => {
    expect(getMaintenanceScanGroupsForSelection('links', 'all')).toEqual(['links'])
    expect(getMaintenanceScanGroupsForSelection('memory', 'all')).toEqual(['memory'])
    expect(getMaintenanceScanGroupsForSelection('all', 'all')).toEqual([
      'links',
      'tasks',
      'properties',
      'memory',
      'structure',
      'bridge'
    ])
  })

  it('lets a specific type override the active scan group', () => {
    expect(getMaintenanceScanGroupsForSelection('links', 'review_open_tasks')).toEqual(['tasks'])
    expect(getMaintenanceScanGroupsForSelection('structure', 'refresh_memory')).toEqual(['memory'])
  })

  it('summarizes maintenance counts by scan group', () => {
    expect(getMaintenanceGroupCount({
      fix_unresolved_link: 2,
      connect_orphan: 3,
      review_open_tasks: 5,
      fill_missing_property: 7
    }, 'links', 20)).toBe(5)
    expect(getMaintenanceGroupCount({
      fix_unresolved_link: 2,
      review_open_tasks: 5
    }, 'all', 20)).toBe(20)
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
