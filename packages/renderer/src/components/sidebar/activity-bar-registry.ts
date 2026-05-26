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
  mainView: 'editor' | 'graph' | 'bases' | 'canvas' | 'timeline' | 'reader' | 'kanban'
  currentFilePath: string | null
}

export const ACTIVITY_BAR_REGISTRY: ActivityBarItemDef[] = [
  { id: 'files', labelKey: 'activityBar.files', shortcut: 'Ctrl+B', defaultVisible: true, defaultOrder: 0, pinned: true },
  { id: 'search', labelKey: 'activityBar.search', shortcut: 'Ctrl+Shift+F', defaultVisible: true, defaultOrder: 1, pinned: true },
  { id: 'chat', labelKey: 'activityBar.chat', shortcut: 'Ctrl+L', defaultVisible: true, defaultOrder: 2 },
  { id: 'graph', labelKey: 'activityBar.graph', shortcut: 'Ctrl+G', defaultVisible: true, defaultOrder: 3 },
  { id: 'canvas', labelKey: 'activityBar.canvas', shortcut: 'Ctrl+Shift+C', defaultVisible: true, defaultOrder: 4 },
  { id: 'reader', labelKey: 'activityBar.reader', defaultVisible: true, defaultOrder: 7 },
  { id: 'outline', labelKey: 'activityBar.outline', shortcut: 'Ctrl+E', defaultVisible: true, defaultOrder: 8, requiresCurrentFile: true },
  { id: 'tags', labelKey: 'activityBar.tags', defaultVisible: true, defaultOrder: 9, requiresCurrentFile: true },
  { id: 'calendar', labelKey: 'activityBar.calendar', defaultVisible: false, defaultOrder: 10 },
  { id: 'kanban', labelKey: 'activityBar.kanban', defaultVisible: true, defaultOrder: 11 },
  { id: 'daily-note', labelKey: 'activityBar.dailyNote', defaultVisible: false, defaultOrder: 12 },
  { id: 'maintenance', labelKey: 'activityBar.maintenance', defaultVisible: true, defaultOrder: 13 },
  { id: 'agent', labelKey: 'activityBar.agent', defaultVisible: false, defaultOrder: 14 },
]

export function isActivityBarItemAvailable(item: ActivityBarItemDef, context: ActivityBarAvailabilityContext): boolean {
  return !item.requiresCurrentFile || (context.mainView === 'editor' && Boolean(context.currentFilePath))
}
