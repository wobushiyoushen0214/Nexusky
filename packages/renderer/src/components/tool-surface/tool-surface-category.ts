import type { ToolSurfaceEntry } from '@shared/types/ipc'

export type ToolSurfaceCommandCategory = 'file' | 'search' | 'ai' | 'plugin' | 'graph' | 'sync' | 'export' | 'interface'

export function toolSurfaceCategoryToCommandCategory(
  category: ToolSurfaceEntry['category']
): ToolSurfaceCommandCategory {
  switch (category) {
    case 'graph': return 'graph'
    case 'maintenance':
    case 'memory':
      return 'ai'
    case 'note':
    case 'task':
    default:
      return 'search'
  }
}
