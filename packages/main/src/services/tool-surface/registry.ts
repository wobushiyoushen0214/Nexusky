export type ToolSurfaceKind = 'read_only' | 'preview_write' | 'agent_only'
export type ToolSurfaceCategory = 'note' | 'graph' | 'memory' | 'task' | 'maintenance'

export interface ToolSurfaceEntry {
  name: string
  kind: ToolSurfaceKind
  category: ToolSurfaceCategory
  labelKey: string
  keywords: string[]
  requiresCurrentNote: boolean
  defaultArgs?: Record<string, unknown>
}

export const TOOL_SURFACE_REGISTRY: readonly ToolSurfaceEntry[] = Object.freeze([
  // Note (7)
  { name: 'search_notes', kind: 'read_only', category: 'note',
    labelKey: 'commandPalette.toolSurface.search_notes.label',
    keywords: ['search', 'find', 'note', '搜索'],
    requiresCurrentNote: false },
  { name: 'find_similar_notes', kind: 'read_only', category: 'note',
    labelKey: 'commandPalette.toolSurface.find_similar_notes.label',
    keywords: ['similar', 'related', '相似', '相关'],
    requiresCurrentNote: true },
  { name: 'find_memory_related_notes', kind: 'read_only', category: 'note',
    labelKey: 'commandPalette.toolSurface.find_memory_related_notes.label',
    keywords: ['memory', 'related', '记忆', '相关'],
    requiresCurrentNote: true },
  { name: 'find_connection_opportunities', kind: 'read_only', category: 'note',
    labelKey: 'commandPalette.toolSurface.find_connection_opportunities.label',
    keywords: ['connect', 'link', 'opportunity', '关联'],
    requiresCurrentNote: true },
  { name: 'read_current_note', kind: 'read_only', category: 'note',
    labelKey: 'commandPalette.toolSurface.read_current_note.label',
    keywords: ['read', 'current', '当前'],
    requiresCurrentNote: true },
  { name: 'read_current_note_properties', kind: 'read_only', category: 'note',
    labelKey: 'commandPalette.toolSurface.read_current_note_properties.label',
    keywords: ['properties', 'frontmatter', '属性'],
    requiresCurrentNote: true },
  { name: 'find_text_in_current_note', kind: 'read_only', category: 'note',
    labelKey: 'commandPalette.toolSurface.find_text_in_current_note.label',
    keywords: ['find', 'text', '查找', '当前'],
    requiresCurrentNote: true },

  // Graph (10)
  { name: 'list_note_links', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_note_links.label',
    keywords: ['link', 'graph', '链接'],
    requiresCurrentNote: false },
  { name: 'list_current_note_links', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_current_note_links.label',
    keywords: ['link', 'current', '当前', '链接'],
    requiresCurrentNote: true },
  { name: 'summarize_current_note_links', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.summarize_current_note_links.label',
    keywords: ['summary', 'link', '链接', '总结'],
    requiresCurrentNote: true },
  { name: 'list_current_note_unlinked_references', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_current_note_unlinked_references.label',
    keywords: ['unlinked', 'reference', '未链接'],
    requiresCurrentNote: true },
  { name: 'list_unresolved_links', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_unresolved_links.label',
    keywords: ['unresolved', 'broken', '未解析'],
    requiresCurrentNote: false },
  { name: 'list_orphan_notes', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_orphan_notes.label',
    keywords: ['orphan', 'isolated', '孤立'],
    requiresCurrentNote: false },
  { name: 'list_unreferenced_notes', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_unreferenced_notes.label',
    keywords: ['unreferenced', '未引用'],
    requiresCurrentNote: false },
  { name: 'list_dead_end_notes', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_dead_end_notes.label',
    keywords: ['dead', 'end', '死路'],
    requiresCurrentNote: false },
  { name: 'list_link_hubs', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_link_hubs.label',
    keywords: ['hub', 'center', '枢纽'],
    requiresCurrentNote: false },
  { name: 'list_knowledge_bridges', kind: 'read_only', category: 'graph',
    labelKey: 'commandPalette.toolSurface.list_knowledge_bridges.label',
    keywords: ['bridge', 'connector', '桥梁'],
    requiresCurrentNote: false },

  // Memory (5)
  { name: 'get_memory_overview', kind: 'read_only', category: 'memory',
    labelKey: 'commandPalette.toolSurface.get_memory_overview.label',
    keywords: ['memory', 'overview', '记忆', '概览'],
    requiresCurrentNote: false },
  { name: 'list_memory_folders', kind: 'read_only', category: 'memory',
    labelKey: 'commandPalette.toolSurface.list_memory_folders.label',
    keywords: ['memory', 'folder', '记忆', '文件夹'],
    requiresCurrentNote: false },
  { name: 'list_memory_terms', kind: 'read_only', category: 'memory',
    labelKey: 'commandPalette.toolSurface.list_memory_terms.label',
    keywords: ['memory', 'term', '记忆', '术语'],
    requiresCurrentNote: false },
  { name: 'list_notes_missing_memory', kind: 'read_only', category: 'memory',
    labelKey: 'commandPalette.toolSurface.list_notes_missing_memory.label',
    keywords: ['memory', 'missing', '缺失', '记忆'],
    requiresCurrentNote: false },
  { name: 'read_current_note_memory', kind: 'read_only', category: 'memory',
    labelKey: 'commandPalette.toolSurface.read_current_note_memory.label',
    keywords: ['memory', 'current', '记忆', '当前'],
    requiresCurrentNote: true },

  // Task (2)
  { name: 'list_tasks', kind: 'read_only', category: 'task',
    labelKey: 'commandPalette.toolSurface.list_tasks.label',
    keywords: ['task', 'todo', '任务'],
    requiresCurrentNote: false },
  { name: 'list_current_note_tasks', kind: 'read_only', category: 'task',
    labelKey: 'commandPalette.toolSurface.list_current_note_tasks.label',
    keywords: ['task', 'current', '当前', '任务'],
    requiresCurrentNote: true },

  // Maintenance (1)
  { name: 'plan_knowledge_maintenance', kind: 'preview_write', category: 'maintenance',
    labelKey: 'commandPalette.toolSurface.plan_knowledge_maintenance.label',
    keywords: ['maintenance', 'plan', '维护', '建议'],
    requiresCurrentNote: false }
])

export function findToolSurfaceEntry(name: string): ToolSurfaceEntry | undefined {
  return TOOL_SURFACE_REGISTRY.find((entry) => entry.name === name)
}

export function listToolSurfaceEntries(): ToolSurfaceEntry[] {
  return TOOL_SURFACE_REGISTRY.map((entry) => ({
    ...entry,
    keywords: [...entry.keywords]
  }))
}
