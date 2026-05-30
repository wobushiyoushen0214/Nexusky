export interface ActivityBarItemDef {
  id: string
  labelKey: string
  shortcut?: string
  defaultVisible: boolean
  defaultOrder: number
  pinned?: boolean
  requiresCurrentFile?: boolean
}

export interface ActivityBarAvailabilityContext {
  mainView: 'editor' | 'graph' | 'bases' | 'canvas' | 'timeline'
  currentFilePath: string | null
}

export const ACTIVITY_BAR_REGISTRY: ActivityBarItemDef[] = [
  { id: 'files', labelKey: 'activityBar.files', shortcut: 'Ctrl+B', defaultVisible: true, defaultOrder: 0, pinned: true },
  { id: 'search', labelKey: 'activityBar.search', shortcut: 'Ctrl+Shift+F', defaultVisible: true, defaultOrder: 1, pinned: true },
  { id: 'chat', labelKey: 'activityBar.chat', shortcut: 'Ctrl+L', defaultVisible: true, defaultOrder: 2 },
  { id: 'graph', labelKey: 'activityBar.graph', shortcut: 'Ctrl+G', defaultVisible: true, defaultOrder: 3 },
  { id: 'canvas', labelKey: 'activityBar.canvas', shortcut: 'Ctrl+Shift+C', defaultVisible: false, defaultOrder: 4 },
  { id: 'outline', labelKey: 'activityBar.outline', shortcut: 'Ctrl+E', defaultVisible: false, defaultOrder: 8, requiresCurrentFile: true },
  { id: 'tags', labelKey: 'activityBar.tags', defaultVisible: false, defaultOrder: 9, requiresCurrentFile: true },
  { id: 'maintenance', labelKey: 'activityBar.maintenance', defaultVisible: true, defaultOrder: 13 },
]

export function isActivityBarItemAvailable(item: ActivityBarItemDef, context: ActivityBarAvailabilityContext): boolean {
  return !item.requiresCurrentFile || (context.mainView === 'editor' && Boolean(context.currentFilePath))
}
