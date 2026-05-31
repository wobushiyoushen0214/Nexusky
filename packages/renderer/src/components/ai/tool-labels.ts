import i18n from '../../i18n'

function getTextArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

function truncateDetail(detail: string): string {
  return detail.length > 72 ? `${detail.slice(0, 69)}...` : detail
}

function appendDetail(label: string, detail: string): string {
  return detail ? `${label}: ${truncateDetail(detail)}` : label
}

const TOOL_STATUS_DETAIL_KEYS: Record<string, string[]> = {
  search_notes: ['query'],
  read_note: ['title'],
  read_current_note: [],
  read_current_note_properties: [],
  read_note_lines: ['title'],
  read_current_note_lines: [],
  find_text_in_note: ['query', 'title'],
  find_text_in_current_note: ['query'],
  list_note_links: ['title'],
  list_current_note_links: [],
  summarize_current_note_links: [],
  list_current_note_unlinked_references: [],
  list_note_headings: ['title'],
  list_current_note_headings: [],
  list_note_blocks: ['title'],
  list_current_note_blocks: [],
  find_similar_notes: ['query'],
  find_memory_related_notes: ['query'],
  find_connection_opportunities: ['query'],
  list_note_memories: ['query'],
  read_note_memory: ['title'],
  read_current_note_memory: [],
  get_memory_overview: [],
  list_memory_folders: ['query'],
  list_memory_terms: ['query', 'type'],
  list_memory_term_pairs: ['query', 'type'],
  list_notes_by_memory_term: ['term'],
  list_notes_missing_memory: ['status'],
  get_vault_overview: [],
  list_tasks: ['query', 'status'],
  list_current_note_tasks: ['query', 'status'],
  list_tags: ['query'],
  list_folders: ['query'],
  list_notes_by_folder: ['folder'],
  list_notes_by_tag: ['tag'],
  list_properties: ['query'],
  list_notes_by_property: ['key'],
  list_property_values: ['key'],
  list_notes_missing_property: ['key'],
  list_recent_notes: ['query'],
  list_unresolved_links: ['query'],
  list_orphan_notes: ['query'],
  list_unreferenced_notes: ['query'],
  list_dead_end_notes: ['query'],
  list_link_hubs: ['mode'],
  list_knowledge_bridges: ['query'],
  plan_knowledge_maintenance: ['query'],
  list_untagged_notes: ['query'],
  list_empty_notes: ['query'],
  list_large_notes: ['query'],
  list_duplicate_note_titles: ['query'],
  list_duplicate_aliases: ['query'],
  create_note: [],
  edit_note: []
}

function getFirstTextArg(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getTextArg(args, key)
    if (value) return value
  }
  return ''
}

export function formatAiToolStatus(name: string, args: Record<string, unknown> = {}): string {
  const detailKeys = TOOL_STATUS_DETAIL_KEYS[name]
  if (!detailKeys) return name || String(i18n.t('aiToolStatus.unknown'))
  const label = String(i18n.t(`aiToolStatus.tools.${name}`, { defaultValue: name }))
  return appendDetail(label, getFirstTextArg(args, detailKeys))
}
