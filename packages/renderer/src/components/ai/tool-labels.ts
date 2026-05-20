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

export function formatAiToolStatus(name: string, args: Record<string, unknown> = {}): string {
  switch (name) {
    case 'search_notes':
      return appendDetail('搜索笔记', getTextArg(args, 'query'))
    case 'read_note':
      return appendDetail('读取笔记', getTextArg(args, 'title'))
    case 'read_current_note':
      return '读取当前笔记'
    case 'read_note_lines':
      return appendDetail('读取笔记行号', getTextArg(args, 'title'))
    case 'find_text_in_note':
      return appendDetail('在笔记内查找', getTextArg(args, 'query') || getTextArg(args, 'title'))
    case 'list_note_links':
      return appendDetail('读取笔记链接', getTextArg(args, 'title'))
    case 'list_note_headings':
      return appendDetail('读取笔记目录', getTextArg(args, 'title'))
    case 'list_current_note_headings':
      return '读取当前笔记目录'
    case 'list_note_blocks':
      return appendDetail('读取块引用', getTextArg(args, 'title'))
    case 'find_similar_notes':
      return appendDetail('查找相似笔记', getTextArg(args, 'query'))
    case 'find_memory_related_notes':
      return appendDetail('查找记忆关联', getTextArg(args, 'query'))
    case 'list_note_memories':
      return appendDetail('浏览笔记记忆', getTextArg(args, 'query'))
    case 'read_note_memory':
      return appendDetail('读取笔记记忆', getTextArg(args, 'title'))
    case 'get_memory_overview':
      return '汇总记忆覆盖'
    case 'list_memory_folders':
      return appendDetail('汇总记忆文件夹', getTextArg(args, 'query'))
    case 'list_memory_terms':
      return appendDetail('汇总记忆概念', getTextArg(args, 'query') || getTextArg(args, 'type'))
    case 'list_memory_term_pairs':
      return appendDetail('分析概念共现', getTextArg(args, 'query') || getTextArg(args, 'type'))
    case 'list_notes_by_memory_term':
      return appendDetail('按记忆概念找笔记', getTextArg(args, 'term'))
    case 'list_notes_missing_memory':
      return appendDetail('检查缺失记忆', getTextArg(args, 'status'))
    case 'get_vault_overview':
      return '汇总知识库'
    case 'list_tasks':
      return appendDetail('查询任务', getTextArg(args, 'query') || getTextArg(args, 'status'))
    case 'list_tags':
      return appendDetail('查询标签', getTextArg(args, 'query'))
    case 'list_folders':
      return appendDetail('查询文件夹', getTextArg(args, 'query'))
    case 'list_notes_by_folder':
      return appendDetail('列出文件夹笔记', getTextArg(args, 'folder'))
    case 'list_notes_by_tag':
      return appendDetail('列出标签笔记', getTextArg(args, 'tag'))
    case 'list_properties':
      return appendDetail('查询属性', getTextArg(args, 'query'))
    case 'list_notes_by_property':
      return appendDetail('按属性找笔记', getTextArg(args, 'key'))
    case 'list_property_values':
      return appendDetail('统计属性取值', getTextArg(args, 'key'))
    case 'list_notes_missing_property':
      return appendDetail('检查缺失属性', getTextArg(args, 'key'))
    case 'list_recent_notes':
      return appendDetail('查看最近笔记', getTextArg(args, 'query'))
    case 'list_unresolved_links':
      return appendDetail('检查断链', getTextArg(args, 'query'))
    case 'list_orphan_notes':
      return appendDetail('检查孤岛笔记', getTextArg(args, 'query'))
    case 'list_unreferenced_notes':
      return appendDetail('检查无反链笔记', getTextArg(args, 'query'))
    case 'list_dead_end_notes':
      return appendDetail('检查终点笔记', getTextArg(args, 'query'))
    case 'list_link_hubs':
      return appendDetail('分析链接枢纽', getTextArg(args, 'mode'))
    case 'list_untagged_notes':
      return appendDetail('检查无标签笔记', getTextArg(args, 'query'))
    case 'list_empty_notes':
      return appendDetail('检查空笔记', getTextArg(args, 'query'))
    case 'list_large_notes':
      return appendDetail('检查长笔记', getTextArg(args, 'query'))
    case 'list_duplicate_note_titles':
      return appendDetail('检查重复标题', getTextArg(args, 'query'))
    case 'list_duplicate_aliases':
      return appendDetail('检查重复 alias', getTextArg(args, 'query'))
    case 'create_note':
      return '请求创建笔记'
    case 'edit_note':
      return '请求修改笔记'
    default:
      return name || '调用工具'
  }
}
