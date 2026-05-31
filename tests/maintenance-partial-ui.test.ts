import { describe, expect, it } from 'vitest'
import { getMaintenanceScanGroupsForFilter } from '../packages/renderer/src/components/maintenance/MaintenanceQueuePanel'

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
})
