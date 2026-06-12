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
  mainView: 'editor' | 'graph' | 'overview' | 'memory' | 'bases'
  currentFilePath: string | null
}

export const ACTIVITY_BAR_REGISTRY: ActivityBarItemDef[] = [
  { id: 'overview', labelKey: 'activityBar.overview', defaultVisible: true, defaultOrder: 0, pinned: true },
  { id: 'memory', labelKey: 'activityBar.memory', defaultVisible: true, defaultOrder: 1 },
  { id: 'files', labelKey: 'activityBar.files', shortcut: 'Ctrl+B', defaultVisible: true, defaultOrder: 2, pinned: true },
  { id: 'search', labelKey: 'activityBar.search', shortcut: 'Ctrl+Shift+F', defaultVisible: true, defaultOrder: 3, pinned: true },
  { id: 'chat', labelKey: 'activityBar.chat', shortcut: 'Ctrl+L', defaultVisible: true, defaultOrder: 4 },
  { id: 'graph', labelKey: 'activityBar.graph', shortcut: 'Ctrl+G', defaultVisible: true, defaultOrder: 5 },
  { id: 'outline', labelKey: 'activityBar.outline', shortcut: 'Ctrl+E', defaultVisible: false, defaultOrder: 8, requiresCurrentFile: true },
  { id: 'tags', labelKey: 'activityBar.tags', defaultVisible: false, defaultOrder: 9, requiresCurrentFile: true },
]

export function isActivityBarItemAvailable(item: ActivityBarItemDef, context: ActivityBarAvailabilityContext): boolean {
  return !item.requiresCurrentFile || (context.mainView === 'editor' && Boolean(context.currentFilePath))
}
