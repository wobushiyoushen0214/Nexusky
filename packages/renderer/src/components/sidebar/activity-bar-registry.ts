export interface ActivityBarItemDef {
  id: string
  label: string
  shortcut?: string
  defaultVisible: boolean
  defaultOrder: number
  pinned?: boolean
}

export const ACTIVITY_BAR_REGISTRY: ActivityBarItemDef[] = [
  { id: 'files', label: '文件', shortcut: 'Ctrl+B', defaultVisible: true, defaultOrder: 0, pinned: true },
  { id: 'search', label: '搜索', shortcut: 'Ctrl+Shift+F', defaultVisible: true, defaultOrder: 1, pinned: true },
  { id: 'chat', label: 'AI 对话', shortcut: 'Ctrl+L', defaultVisible: true, defaultOrder: 2 },
  { id: 'graph', label: '知识图谱', shortcut: 'Ctrl+G', defaultVisible: true, defaultOrder: 3 },
  { id: 'outline', label: '文档大纲', shortcut: 'Ctrl+E', defaultVisible: true, defaultOrder: 4 },
  { id: 'tags', label: '标签', defaultVisible: true, defaultOrder: 5 },
  { id: 'calendar', label: '日历', defaultVisible: false, defaultOrder: 6 },
  { id: 'kanban', label: '看板', defaultVisible: false, defaultOrder: 7 },
  { id: 'daily-note', label: '今日笔记', defaultVisible: false, defaultOrder: 8 },
]
