export interface ActivityBarItemDef {
  id: string
  labelKey: string
  shortcut?: string
  defaultVisible: boolean
  defaultOrder: number
  pinned?: boolean
}

export const ACTIVITY_BAR_REGISTRY: ActivityBarItemDef[] = [
  { id: 'files', labelKey: 'activityBar.files', shortcut: 'Ctrl+B', defaultVisible: true, defaultOrder: 0, pinned: true },
  { id: 'search', labelKey: 'activityBar.search', shortcut: 'Ctrl+Shift+F', defaultVisible: true, defaultOrder: 1, pinned: true },
  { id: 'chat', labelKey: 'activityBar.chat', shortcut: 'Ctrl+L', defaultVisible: true, defaultOrder: 2 },
  { id: 'graph', labelKey: 'activityBar.graph', shortcut: 'Ctrl+G', defaultVisible: true, defaultOrder: 3 },
  { id: 'bases', labelKey: 'activityBar.bases', defaultVisible: true, defaultOrder: 4 },
  { id: 'canvas', labelKey: 'activityBar.canvas', shortcut: 'Ctrl+Shift+C', defaultVisible: true, defaultOrder: 5 },
  { id: 'outline', labelKey: 'activityBar.outline', shortcut: 'Ctrl+E', defaultVisible: true, defaultOrder: 6 },
  { id: 'properties', labelKey: 'activityBar.properties', defaultVisible: true, defaultOrder: 7 },
  { id: 'tags', labelKey: 'activityBar.tags', defaultVisible: true, defaultOrder: 8 },
  { id: 'calendar', labelKey: 'activityBar.calendar', defaultVisible: false, defaultOrder: 9 },
  { id: 'kanban', labelKey: 'activityBar.kanban', defaultVisible: false, defaultOrder: 10 },
  { id: 'daily-note', labelKey: 'activityBar.dailyNote', defaultVisible: false, defaultOrder: 11 },
]
