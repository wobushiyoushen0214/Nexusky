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
  { id: 'outline', labelKey: 'activityBar.outline', shortcut: 'Ctrl+E', defaultVisible: true, defaultOrder: 4 },
  { id: 'tags', labelKey: 'activityBar.tags', defaultVisible: true, defaultOrder: 5 },
  { id: 'calendar', labelKey: 'activityBar.calendar', defaultVisible: false, defaultOrder: 6 },
  { id: 'kanban', labelKey: 'activityBar.kanban', defaultVisible: false, defaultOrder: 7 },
  { id: 'daily-note', labelKey: 'activityBar.dailyNote', defaultVisible: false, defaultOrder: 8 },
]
