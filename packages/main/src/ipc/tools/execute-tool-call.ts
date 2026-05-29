import { readFileSync } from 'fs'
import { join } from 'path'
import { lexicalSearch, findSimilarNotes } from '../../services/search-index'
import { extractJsonFromText } from '../../services/ai/json'
import { extractMarkdownBlockReference, extractMarkdownBlockReferences, extractMarkdownHeadingSection, extractMarkdownHeadings, extractNoteReferenceBlockId, extractNoteReferenceHeading, findNoteCandidatesForAiTool, findNoteForAiTool } from '../../services/ai/note-lookup'
import { formatConnectionOpportunitiesToolResult, formatCurrentNoteLinkStatsToolResult, formatCurrentNotePropertiesToolResult, formatCurrentNoteUnlinkedReferencesToolResult, formatDeadEndNotesToolResult, formatDuplicateAliasesToolResult, formatDuplicateNoteTitlesToolResult, formatEmptyNotesToolResult, formatFindTextInNoteToolResult, formatKnowledgeBridgesToolResult, formatKnowledgeMaintenanceQueueToolResult, formatLargeNotesToolResult, formatLinkHubsToolResult, formatListFoldersToolResult, formatListPropertiesToolResult, formatListTagsToolResult, formatListTasksToolResult, formatMemoryFoldersToolResult, formatMemoryOverviewToolResult, formatMemoryRelatedNotesToolResult, formatMemoryTermPairsToolResult, formatMemoryTermsToolResult, formatMissingMemoryNotesToolResult, formatMissingPropertyNotesToolResult, formatNoteBlocksToolResult, formatNoteHeadingsToolResult, formatNoteLinksToolResult, formatNoteMemoriesToolResult, formatNotesByFolderToolResult, formatNotesByMemoryTermToolResult, formatNotesByPropertyToolResult, formatNotesByTagToolResult, formatOrphanNotesToolResult, formatPropertyValue, formatPropertyValuesToolResult, formatReadNoteLinesToolResult, formatReadNoteMemoryToolResult, formatReadNoteToolResult, formatRecentNotesToolResult, formatSearchNotesToolResult, formatSimilarNotesToolResult, formatUntaggedNotesToolResult, formatUnreferencedNotesToolResult, formatUnresolvedLinksToolResult, formatVaultOverviewToolResult } from '../../services/ai/search-results'
import { findConnectionOpportunities } from '../../services/ai/connection-opportunities'
import { findKnowledgeBridgeNotes } from '../../services/ai/graph-insights'
import { buildKnowledgeMaintenanceQueue, indexTasksByPath, type KnowledgeMaintenanceType } from '../../services/ai/maintenance-queue'
import { normalizeToolLimit } from '../../services/ai/tool-limits'
import { getAllNotes, getAllTags, getAllTasks, getBacklinks, getNotesByTag, getOutgoingLinks, getOutgoingUnlinkedMentions, getPropertyRows, getUnlinkedMentions, indexNote, resolveAllLinks } from '../../services/indexer'
import { getDatabase } from '../../services/database'
import { readMemory, readAllMemories, findRelatedByMemory, deleteMemory } from '../../services/memory'
import type { ChatSource } from '@shared/types/ipc'

function getStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

function getNoteFolderPath(filePath: string): string {
  const index = filePath.lastIndexOf('/')
  return index > 0 ? filePath.slice(0, index) : ''
}

function normalizeFolderArg(folder: string): string {
  return folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function hasPropertyTags(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => formatPropertyValue(item).trim().length > 0)
  return formatPropertyValue(value).trim().length > 0
}

function getPropertyTextValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.map((item) => formatPropertyValue(item).trim()).filter((item) => item.length > 0)
}

function hasNonEmptyProperty(properties: Record<string, unknown>, key: string): boolean {
  const matchedKey = Object.keys(properties).find((propertyKey) => propertyKey.toLowerCase() === key.toLowerCase())
  if (!matchedKey) return false
  return getPropertyTextValues(properties[matchedKey]).length > 0
}

function normalizeMinCharacters(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return 8000
  return Math.max(1000, Math.floor(number))
}

function normalizeMaintenanceProperties(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value.map((item) => String(item))
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : ['status', 'summary']
  return Array.from(new Set(rawValues.map((item) => item.trim()).filter((item) => /^[A-Za-z0-9_-]+$/.test(item))))
}

const KNOWLEDGE_MAINTENANCE_TYPES = new Set<KnowledgeMaintenanceType>([
  'fix_unresolved_link',
  'review_overdue_tasks',
  'review_due_today_tasks',
  'review_high_priority_tasks',
  'review_scheduled_tasks',
  'review_started_tasks',
  'review_blocked_tasks',
  'review_recurring_tasks',
  'review_upcoming_tasks',
  'connect_orphan',
  'fill_empty_note',
  'resolve_duplicate_title',
  'resolve_duplicate_alias',
  'review_open_tasks',
  'link_unlinked_reference',
  'refresh_memory',
  'split_large_note',
  'fill_missing_property',
  'maintain_bridge'
])

function normalizeMaintenanceType(value: unknown): KnowledgeMaintenanceType | undefined {
  if (typeof value !== 'string') return undefined
  const type = value.trim() as KnowledgeMaintenanceType
  return KNOWLEDGE_MAINTENANCE_TYPES.has(type) ? type : undefined
}

function normalizeUpcomingDays(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return 7
  return Math.min(30, Math.max(1, Math.floor(number)))
}

function localDateIso(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeSimilarityThreshold(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return 0.75
  return Math.min(1, Math.max(0, number))
}

function normalizeMemoryRelationThreshold(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return 0.3
  return Math.min(1, Math.max(0, number))
}

function normalizeLinkHubMode(mode: string): 'backlinks' | 'outgoing' | 'total' {
  if (mode === 'backlinks' || mode === 'outgoing') return mode
  return 'total'
}

function getPositiveIntegerArg(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return null
  const integer = Math.floor(number)
  return integer > 0 ? integer : null
}

function isEmptyMarkdownNote(content: string): boolean {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  return withoutFrontmatter
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s+.+$/gm, '')
    .trim().length === 0
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  vaultPath: string,
  currentFilePath?: string | null
): Promise<{ content: string; sources?: { title: string; filePath: string; chunk: string; score: number }[] }> {
  if (!vaultPath) return { content: '未打开知识库，无法使用笔记工具。' }

  switch (name) {
    case 'search_notes': {
      const query = getStringArg(args, 'query')
      if (!query.trim()) return { content: 'search_notes 缺少 query 参数。请根据用户问题提供明确的搜索关键词。' }
      const results = await lexicalSearch(vaultPath, query, normalizeToolLimit(args.limit))
      if (results.length === 0) return { content: '未找到相关笔记。' }
      return {
        content: formatSearchNotesToolResult(results),
        sources: results.map((r) => ({
          title: r.title,
          filePath: r.filePath,
          chunk: r.chunk.slice(0, 100),
          score: r.score
        }))
      }
    }
    case 'find_similar_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const threshold = normalizeSimilarityThreshold(args.threshold)
      const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
      const pairs = findSimilarNotes(vaultPath, Math.max(3, limit), threshold)
        .map((pair) => {
          const source = notesById.get(pair.sourceId)
          const target = notesById.get(pair.targetId)
          if (!source || !target) return null
          return {
            sourceTitle: source.title || pair.sourceTitle,
            sourcePath: source.filePath,
            targetTitle: target.title || pair.targetTitle,
            targetPath: target.filePath,
            score: pair.score
          }
        })
        .filter((pair): pair is { sourceTitle: string; sourcePath: string; targetTitle: string; targetPath: string; score: number } => pair !== null)
        .filter((pair) => !query || [pair.sourceTitle, pair.sourcePath, pair.targetTitle, pair.targetPath].some((value) => value.toLowerCase().includes(query)))
        .sort((a, b) => b.score - a.score || a.sourcePath.localeCompare(b.sourcePath) || a.targetPath.localeCompare(b.targetPath))
        .slice(0, limit)
      return {
        content: formatSimilarNotesToolResult(pairs),
        sources: pairs.flatMap((pair) => [
          {
            title: pair.sourceTitle,
            filePath: pair.sourcePath,
            chunk: `Similar to ${pair.targetTitle}: ${pair.score.toFixed(3)}`,
            score: pair.score
          },
          {
            title: pair.targetTitle,
            filePath: pair.targetPath,
            chunk: `Similar to ${pair.sourceTitle}: ${pair.score.toFixed(3)}`,
            score: pair.score
          }
        ])
      }
    }
    case 'find_memory_related_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const threshold = normalizeMemoryRelationThreshold(args.threshold)
      const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
      const memories = readAllMemories(vaultPath)
      if (memories.length < 2) {
        return { content: 'No note memories found. Generate note memories before using find_memory_related_notes.' }
      }
      const pairs = findRelatedByMemory(vaultPath, Math.max(3, limit))
        .map((pair) => {
          const source = notesById.get(pair.sourceId)
          const target = notesById.get(pair.targetId)
          if (!source || !target) return null
          return {
            sourceTitle: source.title || pair.sourceTitle,
            sourcePath: source.filePath,
            targetTitle: target.title || pair.targetTitle,
            targetPath: target.filePath,
            score: pair.score,
            reason: pair.reason
          }
        })
        .filter((pair): pair is { sourceTitle: string; sourcePath: string; targetTitle: string; targetPath: string; score: number; reason: string } => pair !== null)
        .filter((pair) => pair.score >= threshold)
        .filter((pair) => !query || [pair.sourceTitle, pair.sourcePath, pair.targetTitle, pair.targetPath, pair.reason].some((value) => value.toLowerCase().includes(query)))
        .sort((a, b) => b.score - a.score || a.sourcePath.localeCompare(b.sourcePath) || a.targetPath.localeCompare(b.targetPath))
        .slice(0, limit)
      return {
        content: formatMemoryRelatedNotesToolResult(pairs),
        sources: pairs.flatMap((pair) => [
          {
            title: pair.sourceTitle,
            filePath: pair.sourcePath,
            chunk: `${pair.reason}; related to ${pair.targetTitle}`,
            score: pair.score
          },
          {
            title: pair.targetTitle,
            filePath: pair.targetPath,
            chunk: `${pair.reason}; related to ${pair.sourceTitle}`,
            score: pair.score
          }
        ])
      }
    }
    case 'find_connection_opportunities': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
      const outgoingLinksByNoteId = new Map(notes.map((note) => [note.id, getOutgoingLinks(vaultPath, note.id)]))
      const pairs = findConnectionOpportunities({
        notes,
        propertyRows: getPropertyRows(vaultPath),
        memories: readAllMemories(vaultPath),
        outgoingLinksByNoteId,
        query,
        limit
      })
      return {
        content: formatConnectionOpportunitiesToolResult(pairs),
        sources: pairs.flatMap((pair) => [
          {
            title: pair.sourceTitle,
            filePath: pair.sourcePath,
            chunk: `Connection opportunity with ${pair.targetTitle}: ${pair.reasons.join('; ')}`.slice(0, 100),
            score: pair.score
          },
          {
            title: pair.targetTitle,
            filePath: pair.targetPath,
            chunk: `Connection opportunity with ${pair.sourceTitle}: ${pair.reasons.join('; ')}`.slice(0, 100),
            score: pair.score
          }
        ])
      }
    }
    case 'list_note_memories': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
      const memories = readAllMemories(vaultPath)
        .map((memory) => {
          const note = notesById.get(memory.noteId)
          if (!note) return null
          return {
            title: note.title || memory.title,
            filePath: note.filePath,
            folder: memory.folder,
            concepts: memory.concepts,
            topics: memory.topics,
            summary: memory.summary,
            updatedAt: memory.updatedAt
          }
        })
        .filter((memory): memory is { title: string; filePath: string; folder: string; concepts: string[]; topics: string[]; summary: string; updatedAt: number } => memory !== null)
        .filter((memory) => {
          if (!query) return true
          return [
            memory.title,
            memory.filePath,
            memory.folder,
            memory.summary,
            ...memory.concepts,
            ...memory.topics
          ].some((value) => value.toLowerCase().includes(query))
        })
        .sort((a, b) => b.updatedAt - a.updatedAt || a.filePath.localeCompare(b.filePath))
        .slice(0, limit)
      return {
        content: formatNoteMemoriesToolResult(memories),
        sources: memories.map((memory) => ({
          title: memory.title,
          filePath: memory.filePath,
          chunk: memory.summary.slice(0, 100),
          score: 1
        }))
      }
    }
    case 'get_memory_overview': {
      const notes = getAllNotes(vaultPath)
      const notesById = new Map(notes.map((note) => [note.id, note]))
      const memories = readAllMemories(vaultPath)
      const memoryNoteIds = new Set<string>()
      const concepts = new Set<string>()
      const topics = new Set<string>()
      let current = 0
      let stale = 0
      let orphanMemories = 0
      for (const memory of memories) {
        const note = notesById.get(memory.noteId)
        if (!note) {
          orphanMemories += 1
          continue
        }
        memoryNoteIds.add(memory.noteId)
        if (memory.contentHash === note.contentHash) current += 1
        else stale += 1
        for (const concept of memory.concepts) {
          const normalized = concept.trim().toLowerCase()
          if (normalized) concepts.add(normalized)
        }
        for (const topic of memory.topics) {
          const normalized = topic.trim().toLowerCase()
          if (normalized) topics.add(normalized)
        }
      }
      return {
        content: formatMemoryOverviewToolResult({
          notes: notes.length,
          memories: memoryNoteIds.size,
          current,
          stale,
          missing: notes.length - memoryNoteIds.size,
          orphanMemories,
          concepts: concepts.size,
          topics: topics.size
        })
      }
    }
    case 'list_memory_folders': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const folders = new Map<string, { path: string; notes: number; current: number; stale: number; missing: number }>()
      for (const note of getAllNotes(vaultPath)) {
        const path = getNoteFolderPath(note.filePath) || '_root'
        const folder = folders.get(path) || { path, notes: 0, current: 0, stale: 0, missing: 0 }
        folder.notes += 1
        const memory = readMemory(vaultPath, note.id)
        if (!memory) folder.missing += 1
        else if (memory.contentHash === note.contentHash) folder.current += 1
        else folder.stale += 1
        folders.set(path, folder)
      }
      const rows = Array.from(folders.values())
        .filter((folder) => !query || folder.path.toLowerCase().includes(query))
        .sort((a, b) => b.missing - a.missing || b.stale - a.stale || b.notes - a.notes || a.path.localeCompare(b.path))
        .slice(0, limit)
      return { content: formatMemoryFoldersToolResult(rows) }
    }
    case 'list_memory_terms': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const type = getStringArg(args, 'type').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
      const groups = new Map<string, { term: string; type: 'concept' | 'topic'; count: number; samplePaths: string[] }>()
      const addTerms = (terms: string[], termType: 'concept' | 'topic', filePath: string) => {
        for (const rawTerm of new Set(terms.map((term) => term.trim()).filter(Boolean))) {
          const key = `${termType}:${rawTerm.toLowerCase()}`
          const group = groups.get(key) || { term: rawTerm, type: termType, count: 0, samplePaths: [] }
          group.count += 1
          if (group.samplePaths.length < 3 && !group.samplePaths.includes(filePath)) {
            group.samplePaths.push(filePath)
          }
          groups.set(key, group)
        }
      }
      for (const memory of readAllMemories(vaultPath)) {
        const note = notesById.get(memory.noteId)
        if (!note) continue
        if (type !== 'topic') addTerms(memory.concepts, 'concept', note.filePath)
        if (type !== 'concept') addTerms(memory.topics, 'topic', note.filePath)
      }
      const terms = Array.from(groups.values())
        .filter((term) => !query || term.term.toLowerCase().includes(query))
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type) || a.term.localeCompare(b.term))
        .slice(0, limit)
      return {
        content: formatMemoryTermsToolResult(terms),
        sources: terms.flatMap((term) => term.samplePaths.map((filePath) => ({
          title: term.term,
          filePath,
          chunk: `${term.type}: ${term.term}`,
          score: term.count
        })))
      }
    }
    case 'list_memory_term_pairs': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const type = getStringArg(args, 'type').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
      const pairs = new Map<string, { first: string; second: string; type: 'concept' | 'topic' | 'mixed'; count: number; samplePaths: string[] }>()
      const addPair = (first: string, second: string, pairType: 'concept' | 'topic' | 'mixed', filePath: string) => {
        const ordered = [first, second].sort((a, b) => a.localeCompare(b))
        const key = `${pairType}:${ordered[0].toLowerCase()}\u0000${ordered[1].toLowerCase()}`
        const pair = pairs.get(key) || { first: ordered[0], second: ordered[1], type: pairType, count: 0, samplePaths: [] }
        pair.count += 1
        if (pair.samplePaths.length < 3 && !pair.samplePaths.includes(filePath)) {
          pair.samplePaths.push(filePath)
        }
        pairs.set(key, pair)
      }
      const addPairs = (terms: string[], pairType: 'concept' | 'topic', filePath: string) => {
        const unique = Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)))
        for (let i = 0; i < unique.length; i++) {
          for (let j = i + 1; j < unique.length; j++) addPair(unique[i], unique[j], pairType, filePath)
        }
      }
      for (const memory of readAllMemories(vaultPath)) {
        const note = notesById.get(memory.noteId)
        if (!note) continue
        const concepts = Array.from(new Set(memory.concepts.map((term) => term.trim()).filter(Boolean)))
        const topics = Array.from(new Set(memory.topics.map((term) => term.trim()).filter(Boolean)))
        if (type !== 'topic' && type !== 'mixed') addPairs(concepts, 'concept', note.filePath)
        if (type !== 'concept' && type !== 'mixed') addPairs(topics, 'topic', note.filePath)
        if (type !== 'concept' && type !== 'topic') {
          for (const concept of concepts) {
            for (const topic of topics) addPair(concept, topic, 'mixed', note.filePath)
          }
        }
      }
      const rows = Array.from(pairs.values())
        .filter((pair) => !query || [pair.first, pair.second].some((term) => term.toLowerCase().includes(query)))
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type) || a.first.localeCompare(b.first) || a.second.localeCompare(b.second))
        .slice(0, limit)
      return {
        content: formatMemoryTermPairsToolResult(rows),
        sources: rows.flatMap((pair) => pair.samplePaths.map((filePath) => ({
          title: `${pair.first} + ${pair.second}`,
          filePath,
          chunk: `${pair.type}: ${pair.first} + ${pair.second}`,
          score: pair.count
        })))
      }
    }
    case 'list_notes_by_memory_term': {
      const term = getStringArg(args, 'term').trim()
      if (!term) return { content: 'list_notes_by_memory_term 缺少 term 参数。请提供要查询的概念或主题。' }
      const type = getStringArg(args, 'type').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const termLower = term.toLowerCase()
      const notesById = new Map(getAllNotes(vaultPath).map((note) => [note.id, note]))
      const notes = readAllMemories(vaultPath)
        .map((memory) => {
          const note = notesById.get(memory.noteId)
          if (!note) return null
          const conceptMatches = type !== 'topic'
            ? memory.concepts.filter((concept) => concept.toLowerCase() === termLower)
            : []
          const topicMatches = type !== 'concept'
            ? memory.topics.filter((topic) => topic.toLowerCase() === termLower)
            : []
          const matchedTerms = [...conceptMatches, ...topicMatches]
          if (matchedTerms.length === 0) return null
          return {
            title: note.title || memory.title,
            filePath: note.filePath,
            matchedTerms,
            summary: memory.summary,
            updatedAt: memory.updatedAt
          }
        })
        .filter((note): note is { title: string; filePath: string; matchedTerms: string[]; summary: string; updatedAt: number } => note !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt || a.filePath.localeCompare(b.filePath))
        .slice(0, limit)
      return {
        content: formatNotesByMemoryTermToolResult(term, notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: note.summary.slice(0, 100),
          score: note.matchedTerms.length
        }))
      }
    }
    case 'list_notes_missing_memory': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const status = getStringArg(args, 'status').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
        .map((note) => {
          const memory = readMemory(vaultPath, note.id)
          const reason = memory ? (memory.contentHash === note.contentHash ? null : 'stale') : 'missing'
          if (!reason) return null
          return {
            title: note.title,
            filePath: note.filePath,
            updatedAt: note.updatedAt,
            reason
          }
        })
        .filter((note): note is { title: string; filePath: string; updatedAt: number; reason: 'missing' | 'stale' } => note !== null)
        .filter((note) => status === 'missing' || status === 'stale' ? note.reason === status : true)
        .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
        .sort((a, b) => b.updatedAt - a.updatedAt || a.filePath.localeCompare(b.filePath))
        .slice(0, limit)
      return {
        content: formatMissingMemoryNotesToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `Memory ${note.reason}`,
          score: 1
        }))
      }
    }
    case 'read_note_memory': {
      const title = getStringArg(args, 'title')
      if (!title.trim()) return { content: 'read_note_memory 缺少 title 参数。请先搜索笔记，或提供要读取 memory 的笔记标题。' }
      const note = findNoteForAiTool(vaultPath, title)
      if (!note) {
        const candidates = findNoteCandidatesForAiTool(vaultPath, title)
        if (candidates.length > 1) {
          return {
            content: `找到多个可能的笔记，请用 read_note_memory 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
          }
        }
        return { content: `未找到标题为「${title}」的笔记。` }
      }
      const indexedNote = getAllNotes(vaultPath).find((item) => item.filePath === note.filePath)
      if (!indexedNote) return { content: `未找到笔记「${note.title}」的索引记录。` }
      const memory = readMemory(vaultPath, indexedNote.id)
      if (!memory) return { content: `No memory found for ${note.title} (${note.filePath}).` }
      const status = memory.contentHash === indexedNote.contentHash ? 'current' : 'stale'
      return {
        content: formatReadNoteMemoryToolResult({
          title: note.title,
          filePath: note.filePath,
          folder: memory.folder,
          concepts: memory.concepts,
          topics: memory.topics,
          summary: memory.summary,
          updatedAt: memory.updatedAt,
          status
        }),
        sources: [{
          title: note.title,
          filePath: note.filePath,
          chunk: memory.summary.slice(0, 100),
          score: status === 'current' ? 1 : 0.5
        }]
      }
    }
    case 'read_current_note_memory': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 read_note_memory 指定标题/路径。' }
      return executeToolCall('read_note_memory', { title: currentFilePath }, vaultPath, currentFilePath)
    }
    case 'read_note': {
      const title = getStringArg(args, 'title')
      if (!title.trim()) return { content: 'read_note 缺少 title 参数。请先搜索笔记，或提供要读取的笔记标题。' }
      const note = findNoteForAiTool(vaultPath, title)
      if (!note) {
        const candidates = findNoteCandidatesForAiTool(vaultPath, title)
        if (candidates.length > 1) {
          return {
            content: `找到多个可能的笔记，请用 read_note 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
          }
        }
        return { content: `未找到标题为「${title}」的笔记。` }
      }
      try {
        const content = readFileSync(note.absolutePath, 'utf-8')
        const blockId = extractNoteReferenceBlockId(title)
        const block = blockId ? extractMarkdownBlockReference(content, blockId) : null
        const heading = block ? null : extractNoteReferenceHeading(title)
        const section = heading ? extractMarkdownHeadingSection(content, heading) : null
        const selectedContent = block || section || content
        return {
          content: formatReadNoteToolResult({ title: note.title, filePath: note.filePath, content: selectedContent, section: section ? heading || undefined : undefined, blockId: block ? blockId || undefined : undefined }),
          sources: [{
            title: note.title,
            filePath: note.filePath,
            chunk: selectedContent.slice(0, 100),
            score: 1
          }]
        }
      } catch {
        return { content: `无法读取笔记「${title}」。` }
      }
    }
    case 'read_current_note': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 read_note 指定标题/路径。' }
      return executeToolCall('read_note', { title: currentFilePath }, vaultPath, currentFilePath)
    }
    case 'read_current_note_properties': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_properties 查询全库属性。' }
      const note = findNoteForAiTool(vaultPath, currentFilePath)
      if (!note) return { content: `未找到当前笔记「${currentFilePath}」的索引记录。请先刷新索引。` }
      const row = getPropertyRows(vaultPath).find((item) => item.filePath === note.filePath)
      if (!row) return { content: `未找到当前笔记「${note.filePath}」的属性索引。请先刷新索引。` }
      const properties = Object.entries(row.properties)
        .map(([key, value]) => ({ key, value: formatPropertyValue(value).trim() }))
        .filter((property) => property.value.length > 0)
        .sort((a, b) => a.key.localeCompare(b.key))
      return {
        content: formatCurrentNotePropertiesToolResult({ title: row.title, filePath: row.filePath, properties }),
        sources: [{
          title: row.title,
          filePath: row.filePath,
          chunk: properties.slice(0, 5).map((property) => `${property.key}: ${property.value}`).join('\n').slice(0, 100),
          score: 1
        }]
      }
    }
    case 'read_note_lines': {
      const title = getStringArg(args, 'title')
      const startLineArg = getPositiveIntegerArg(args.startLine)
      if (!title.trim()) return { content: 'read_note_lines 缺少 title 参数。请先搜索笔记，或提供要读取的笔记标题。' }
      if (!startLineArg) return { content: 'read_note_lines 缺少有效的 startLine 参数。请提供从 1 开始的行号。' }
      const note = findNoteForAiTool(vaultPath, title)
      if (!note) {
        const candidates = findNoteCandidatesForAiTool(vaultPath, title)
        if (candidates.length > 1) {
          return {
            content: `找到多个可能的笔记，请用 read_note_lines 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
          }
        }
        return { content: `未找到标题为「${title}」的笔记。` }
      }
      try {
        const content = readFileSync(note.absolutePath, 'utf-8')
        const lines = content.split('\n')
        const startLine = Math.min(startLineArg, lines.length || 1)
        const requestedEndLine = getPositiveIntegerArg(args.endLine) || startLine + 79
        const endLine = Math.min(lines.length || 1, Math.max(startLine, requestedEndLine), startLine + 199)
        const selectedContent = lines.slice(startLine - 1, endLine).join('\n')
        return {
          content: formatReadNoteLinesToolResult({ title: note.title, filePath: note.filePath, content: selectedContent, startLine, endLine }),
          sources: [{
            title: note.title,
            filePath: note.filePath,
            chunk: selectedContent.slice(0, 100),
            score: 1
          }]
        }
      } catch {
        return { content: `无法读取笔记「${title}」。` }
      }
    }
    case 'read_current_note_lines': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 read_note_lines 指定标题/路径。' }
      return executeToolCall('read_note_lines', { ...args, title: currentFilePath }, vaultPath, currentFilePath)
    }
    case 'find_text_in_note': {
      const title = getStringArg(args, 'title')
      const query = getStringArg(args, 'query').trim()
      if (!title.trim()) return { content: 'find_text_in_note 缺少 title 参数。请先搜索笔记，或提供要查找的笔记标题。' }
      if (!query) return { content: 'find_text_in_note 缺少 query 参数。请提供要在笔记中查找的文本。' }
      const note = findNoteForAiTool(vaultPath, title)
      if (!note) {
        const candidates = findNoteCandidatesForAiTool(vaultPath, title)
        if (candidates.length > 1) {
          return {
            content: `找到多个可能的笔记，请用 find_text_in_note 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
          }
        }
        return { content: `未找到标题为「${title}」的笔记。` }
      }
      try {
        const content = readFileSync(note.absolutePath, 'utf-8')
        const needle = query.toLowerCase()
        const limit = normalizeToolLimit(args.limit)
        const matches = content.split('\n')
          .map((line, index) => ({ line: index + 1, context: line.trim() }))
          .filter((match) => match.context.toLowerCase().includes(needle))
          .slice(0, limit)
        return {
          content: formatFindTextInNoteToolResult({ title: note.title, filePath: note.filePath, query, matches }),
          sources: matches.map((match) => ({
            title: note.title,
            filePath: note.filePath,
            chunk: `Line ${match.line}: ${match.context}`.slice(0, 100),
            score: 1
          }))
        }
      } catch {
        return { content: `无法读取笔记「${title}」。` }
      }
    }
    case 'find_text_in_current_note': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 find_text_in_note 指定标题/路径。' }
      return executeToolCall('find_text_in_note', { ...args, title: currentFilePath }, vaultPath, currentFilePath)
    }
    case 'get_vault_overview': {
      const notes = getAllNotes(vaultPath)
      const tasks = getAllTasks(vaultPath)
      const propertyKeys = new Set<string>()
      for (const row of getPropertyRows(vaultPath)) {
        Object.keys(row.properties).forEach((key) => propertyKeys.add(key))
      }
      let resolvedLinks = 0
      let unresolvedLinks = 0
      let orphanNotes = 0
      for (const note of notes) {
        const outgoing = getOutgoingLinks(vaultPath, note.id)
        const hasResolvedOutgoing = outgoing.some((link) => link.resolved)
        const hasBacklinks = getBacklinks(vaultPath, note.id).length > 0
        resolvedLinks += outgoing.filter((link) => link.resolved).length
        unresolvedLinks += outgoing.filter((link) => !link.resolved).length
        if (!hasResolvedOutgoing && !hasBacklinks) orphanNotes += 1
      }
      return {
        content: formatVaultOverviewToolResult({
          notes: notes.length,
          tags: getAllTags(vaultPath).length,
          properties: propertyKeys.size,
          tasksOpen: tasks.filter((task) => !task.done).length,
          tasksDone: tasks.filter((task) => task.done).length,
          resolvedLinks,
          unresolvedLinks,
          orphanNotes
        })
      }
    }
    case 'list_note_links': {
      const title = getStringArg(args, 'title')
      if (!title.trim()) return { content: 'list_note_links 缺少 title 参数。请先搜索笔记，或提供要查看关系的笔记标题。' }
      const note = findNoteForAiTool(vaultPath, title)
      if (!note) {
        const candidates = findNoteCandidatesForAiTool(vaultPath, title)
        if (candidates.length > 1) {
          return {
            content: `找到多个可能的笔记，请用 list_note_links 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
          }
        }
        return { content: `未找到标题为「${title}」的笔记。` }
      }

      const db = getDatabase(vaultPath)
      const row = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(note.filePath) as { id: string } | undefined
      if (!row) return { content: `未找到笔记索引「${note.filePath}」。请先刷新索引。` }

      const outgoing = getOutgoingLinks(vaultPath, row.id)
      const backlinks = getBacklinks(vaultPath, row.id)
      const unlinkedMentions = getUnlinkedMentions(vaultPath, row.id)
      return {
        content: formatNoteLinksToolResult({ title: note.title, filePath: note.filePath, outgoing, backlinks, unlinkedMentions }),
        sources: [{
          title: note.title,
          filePath: note.filePath,
          chunk: `Outgoing: ${outgoing.length}; Backlinks: ${backlinks.length}; Unlinked mentions: ${unlinkedMentions.length}`,
          score: 1
        }]
      }
    }
    case 'list_current_note_links': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_links 指定标题/路径。' }
      return executeToolCall('list_note_links', { title: currentFilePath }, vaultPath, currentFilePath)
    }
    case 'summarize_current_note_links': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_links 指定标题/路径。' }
      const note = findNoteForAiTool(vaultPath, currentFilePath)
      if (!note) return { content: `未找到当前笔记「${currentFilePath}」的索引记录。请先刷新索引。` }
      const db = getDatabase(vaultPath)
      const row = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(note.filePath) as { id: string } | undefined
      if (!row) return { content: `未找到笔记索引「${note.filePath}」。请先刷新索引。` }
      const outgoing = getOutgoingLinks(vaultPath, row.id)
      const backlinks = getBacklinks(vaultPath, row.id)
      const unlinkedMentions = getUnlinkedMentions(vaultPath, row.id)
      const resolvedOutgoing = outgoing.filter((link) => link.resolved).length
      const unresolvedOutgoing = outgoing.length - resolvedOutgoing
      return {
        content: formatCurrentNoteLinkStatsToolResult({
          title: note.title,
          filePath: note.filePath,
          outgoing: outgoing.length,
          resolvedOutgoing,
          unresolvedOutgoing,
          backlinks: backlinks.length,
          unlinkedMentions: unlinkedMentions.length
        }),
        sources: [{
          title: note.title,
          filePath: note.filePath,
          chunk: `Outgoing: ${outgoing.length}; Backlinks: ${backlinks.length}; Unlinked mentions: ${unlinkedMentions.length}`,
          score: 1
        }]
      }
    }
    case 'list_current_note_unlinked_references': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_links 指定标题/路径。' }
      const note = findNoteForAiTool(vaultPath, currentFilePath)
      if (!note) return { content: `未找到当前笔记「${currentFilePath}」的索引记录。请先刷新索引。` }
      const db = getDatabase(vaultPath)
      const row = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(note.filePath) as { id: string } | undefined
      if (!row) return { content: `未找到笔记索引「${note.filePath}」。请先刷新索引。` }
      const references = getOutgoingUnlinkedMentions(vaultPath, row.id)
      return {
        content: formatCurrentNoteUnlinkedReferencesToolResult({ title: note.title, filePath: note.filePath, references }),
        sources: references.map((reference) => ({
          title: reference.targetTitle,
          filePath: reference.targetPath,
          chunk: reference.context,
          score: 1
        }))
      }
    }
    case 'list_note_headings': {
      const title = getStringArg(args, 'title')
      if (!title.trim()) return { content: 'list_note_headings 缺少 title 参数。请先搜索笔记，或提供要查看目录的笔记标题。' }
      const note = findNoteForAiTool(vaultPath, title)
      if (!note) {
        const candidates = findNoteCandidatesForAiTool(vaultPath, title)
        if (candidates.length > 1) {
          return {
            content: `找到多个可能的笔记，请用 list_note_headings 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
          }
        }
        return { content: `未找到标题为「${title}」的笔记。` }
      }
      try {
        const headings = extractMarkdownHeadings(readFileSync(note.absolutePath, 'utf-8'))
        return {
          content: formatNoteHeadingsToolResult({ title: note.title, filePath: note.filePath, headings }),
          sources: [{
            title: note.title,
            filePath: note.filePath,
            chunk: `${headings.length} headings`,
            score: 1
          }]
        }
      } catch {
        return { content: `无法读取笔记「${title}」。` }
      }
    }
    case 'list_current_note_headings': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_headings 指定标题/路径。' }
      return executeToolCall('list_note_headings', { title: currentFilePath }, vaultPath, currentFilePath)
    }
    case 'list_note_blocks': {
      const title = getStringArg(args, 'title')
      if (!title.trim()) return { content: 'list_note_blocks 缺少 title 参数。请先搜索笔记，或提供要查看块引用的笔记标题。' }
      const note = findNoteForAiTool(vaultPath, title)
      if (!note) {
        const candidates = findNoteCandidatesForAiTool(vaultPath, title)
        if (candidates.length > 1) {
          return {
            content: `找到多个可能的笔记，请用 list_note_blocks 的 title 参数传入精确路径重试：\n${candidates.map((item) => `- ${item.filePath} (${item.title})`).join('\n')}`
          }
        }
        return { content: `未找到标题为「${title}」的笔记。` }
      }
      try {
        const blocks = extractMarkdownBlockReferences(readFileSync(note.absolutePath, 'utf-8'))
        return {
          content: formatNoteBlocksToolResult({ title: note.title, filePath: note.filePath, blocks }),
          sources: [{
            title: note.title,
            filePath: note.filePath,
            chunk: `${blocks.length} block references`,
            score: 1
          }]
        }
      } catch {
        return { content: `无法读取笔记「${title}」。` }
      }
    }
    case 'list_current_note_blocks': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_note_blocks 指定标题/路径。' }
      return executeToolCall('list_note_blocks', { title: currentFilePath }, vaultPath, currentFilePath)
    }
    case 'list_tasks': {
      const status = getStringArg(args, 'status').trim().toLowerCase()
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const tasks = getAllTasks(vaultPath)
        .filter((task) => {
          if (status === 'done') return task.done
          if (status === 'all') return true
          return !task.done
        })
        .filter((task) => {
          if (!query) return true
          return [task.text, task.noteTitle, task.filePath].some((value) => value.toLowerCase().includes(query))
        })
        .slice(0, limit)
      return {
        content: formatListTasksToolResult(tasks),
        sources: tasks.map((task) => ({
          title: task.noteTitle,
          filePath: task.filePath,
          chunk: `${task.done ? '[x]' : '[ ]'} ${task.text}`.slice(0, 100),
          score: 1
        }))
      }
    }
    case 'list_current_note_tasks': {
      if (!currentFilePath) return { content: '当前没有打开的笔记。请先打开一篇笔记，或改用 list_tasks 查询全库任务。' }
      const note = findNoteForAiTool(vaultPath, currentFilePath)
      if (!note) return { content: `未找到当前笔记「${currentFilePath}」的索引记录。请先刷新索引。` }
      const status = getStringArg(args, 'status').trim().toLowerCase()
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const tasks = getAllTasks(vaultPath)
        .filter((task) => task.filePath === note.filePath)
        .filter((task) => {
          if (status === 'done') return task.done
          if (status === 'all') return true
          return !task.done
        })
        .filter((task) => !query || task.text.toLowerCase().includes(query))
        .slice(0, limit)
      return {
        content: formatListTasksToolResult(tasks),
        sources: tasks.map((task) => ({
          title: task.noteTitle,
          filePath: task.filePath,
          chunk: `${task.done ? '[x]' : '[ ]'} ${task.text}`.slice(0, 100),
          score: 1
        }))
      }
    }
    case 'list_tags': {
      const query = getStringArg(args, 'query').trim().toLowerCase().replace(/^#/, '')
      const limit = normalizeToolLimit(args.limit)
      const tags = getAllTags(vaultPath)
        .filter((tag) => !query || tag.name.toLowerCase().includes(query))
        .slice(0, limit)
      return { content: formatListTagsToolResult(tags) }
    }
    case 'list_folders': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const counts = new Map<string, number>()
      for (const note of getAllNotes(vaultPath)) {
        const folder = getNoteFolderPath(note.filePath)
        if (!folder) continue
        counts.set(folder, (counts.get(folder) || 0) + 1)
      }
      const folders = Array.from(counts.entries())
        .map(([path, count]) => ({ path, count }))
        .filter((folder) => !query || folder.path.toLowerCase().includes(query))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, limit)
      return { content: formatListFoldersToolResult(folders) }
    }
    case 'list_notes_by_folder': {
      const folder = normalizeFolderArg(getStringArg(args, 'folder'))
      if (!folder) return { content: 'list_notes_by_folder 缺少 folder 参数。请提供要查询的文件夹路径。' }
      const recursive = args.recursive !== false
      const prefix = `${folder}/`
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
        .filter((note) => {
          const path = note.filePath
          if (recursive) return path.startsWith(prefix)
          return getNoteFolderPath(path) === folder
        })
        .slice(0, limit)
      return {
        content: formatNotesByFolderToolResult(folder, notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `Folder: ${folder}`,
          score: 1
        }))
      }
    }
    case 'list_notes_by_tag': {
      const tag = getStringArg(args, 'tag').trim().replace(/^#/, '')
      if (!tag) return { content: 'list_notes_by_tag 缺少 tag 参数。请提供要查询的标签名。' }
      const limit = normalizeToolLimit(args.limit)
      const notes = getNotesByTag(vaultPath, tag).slice(0, limit)
      return {
        content: formatNotesByTagToolResult(tag, notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `#${tag}`,
          score: 1
        }))
      }
    }
    case 'list_properties': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const summaries = new Map<string, { key: string; count: number; sampleValues: string[] }>()
      for (const row of getPropertyRows(vaultPath)) {
        for (const [key, value] of Object.entries(row.properties)) {
          if (query && !key.toLowerCase().includes(query)) continue
          const current = summaries.get(key) || { key, count: 0, sampleValues: [] }
          current.count += 1
          const text = formatPropertyValue(value)
          if (text && !current.sampleValues.includes(text) && current.sampleValues.length < 3) {
            current.sampleValues.push(text)
          }
          summaries.set(key, current)
        }
      }
      const properties = Array.from(summaries.values())
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
        .slice(0, limit)
      return { content: formatListPropertiesToolResult(properties) }
    }
    case 'list_notes_by_property': {
      const key = getStringArg(args, 'key').trim()
      if (!key) return { content: 'list_notes_by_property 缺少 key 参数。请提供要查询的属性键。' }
      const value = getStringArg(args, 'value').trim()
      const valueQuery = value.toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getPropertyRows(vaultPath)
        .map((row) => {
          const matchedKey = Object.keys(row.properties).find((propertyKey) => propertyKey.toLowerCase() === key.toLowerCase())
          if (!matchedKey) return null
          const text = formatPropertyValue(row.properties[matchedKey])
          if (valueQuery && !text.toLowerCase().includes(valueQuery)) return null
          return { title: row.title, filePath: row.filePath, value: text }
        })
        .filter((row): row is { title: string; filePath: string; value: string } => row !== null)
        .slice(0, limit)
      return {
        content: formatNotesByPropertyToolResult(key, notes, value || undefined),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `${key}: ${note.value}`.slice(0, 100),
          score: 1
        }))
      }
    }
    case 'list_property_values': {
      const key = getStringArg(args, 'key').trim()
      if (!key) return { content: 'list_property_values 缺少 key 参数。请提供要查询的属性键。' }
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const values = new Map<string, { value: string; count: number; samplePaths: string[] }>()
      for (const row of getPropertyRows(vaultPath)) {
        const matchedKey = Object.keys(row.properties).find((propertyKey) => propertyKey.toLowerCase() === key.toLowerCase())
        if (!matchedKey) continue
        const raw = row.properties[matchedKey]
        const rawValues = Array.isArray(raw) ? raw : [raw]
        for (const value of rawValues) {
          const text = formatPropertyValue(value).trim()
          if (!text || (query && !text.toLowerCase().includes(query))) continue
          const current = values.get(text) || { value: text, count: 0, samplePaths: [] }
          current.count += 1
          if (!current.samplePaths.includes(row.filePath) && current.samplePaths.length < 3) {
            current.samplePaths.push(row.filePath)
          }
          values.set(text, current)
        }
      }
      const summaries = Array.from(values.values())
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, limit)
      return { content: formatPropertyValuesToolResult(key, summaries) }
    }
    case 'list_notes_missing_property': {
      const key = getStringArg(args, 'key').trim()
      if (!key) return { content: 'list_notes_missing_property 缺少 key 参数。请提供要检查的属性键。' }
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getPropertyRows(vaultPath)
        .filter((row) => !hasNonEmptyProperty(row.properties, key))
        .filter((row) => !query || [row.title, row.filePath].some((value) => value.toLowerCase().includes(query)))
        .map((row) => ({ title: row.title, filePath: row.filePath, updatedAt: row.updatedAt }))
        .slice(0, limit)
      return {
        content: formatMissingPropertyNotesToolResult(key, notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `Missing property: ${key}`,
          score: 1
        }))
      }
    }
    case 'list_recent_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
        .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
        .slice(0, limit)
      return {
        content: formatRecentNotesToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `Updated: ${new Date(note.updatedAt).toISOString()}`,
          score: 1
        }))
      }
    }
    case 'list_unresolved_links': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const links = getAllNotes(vaultPath).flatMap((note) => (
        getOutgoingLinks(vaultPath, note.id)
          .filter((link) => !link.resolved)
          .map((link) => ({
            sourceTitle: note.title,
            sourcePath: note.filePath,
            targetTitle: link.targetTitle,
            context: link.context
          }))
      )).filter((link) => {
        if (!query) return true
        return [link.sourceTitle, link.sourcePath, link.targetTitle, link.context].some((value) => value.toLowerCase().includes(query))
      }).slice(0, limit)
      return {
        content: formatUnresolvedLinksToolResult(links),
        sources: links.map((link) => ({
          title: link.sourceTitle,
          filePath: link.sourcePath,
          chunk: `[[${link.targetTitle}]] ${link.context}`.slice(0, 100),
          score: 1
        }))
      }
    }
    case 'list_orphan_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
        .filter((note) => {
          const hasResolvedOutgoing = getOutgoingLinks(vaultPath, note.id).some((link) => link.resolved)
          const hasBacklinks = getBacklinks(vaultPath, note.id).length > 0
          return !hasResolvedOutgoing && !hasBacklinks
        })
        .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
        .slice(0, limit)
      return {
        content: formatOrphanNotesToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: 'Orphan note: no resolved outgoing links or backlinks',
          score: 1
        }))
      }
    }
    case 'list_unreferenced_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
        .filter((note) => getBacklinks(vaultPath, note.id).length === 0)
        .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
        .slice(0, limit)
      return {
        content: formatUnreferencedNotesToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: 'Unreferenced note: no backlinks',
          score: 1
        }))
      }
    }
    case 'list_dead_end_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
        .filter((note) => !getOutgoingLinks(vaultPath, note.id).some((link) => link.resolved))
        .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
        .slice(0, limit)
      return {
        content: formatDeadEndNotesToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: 'Dead-end note: no resolved outgoing links',
          score: 1
        }))
      }
    }
    case 'list_link_hubs': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const mode = normalizeLinkHubMode(getStringArg(args, 'mode').trim().toLowerCase())
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
        .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
        .map((note) => {
          const backlinks = getBacklinks(vaultPath, note.id).length
          const outgoing = getOutgoingLinks(vaultPath, note.id).filter((link) => link.resolved).length
          return { title: note.title, filePath: note.filePath, backlinks, outgoing, total: backlinks + outgoing }
        })
        .filter((note) => note.total > 0)
        .sort((a, b) => b[mode] - a[mode] || b.total - a.total || a.title.localeCompare(b.title))
        .slice(0, limit)
      return {
        content: formatLinkHubsToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `Backlinks: ${note.backlinks}; outgoing: ${note.outgoing}; total: ${note.total}`,
          score: note.total
        }))
      }
    }
    case 'list_knowledge_bridges': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
      const outgoingLinksByNoteId = new Map(notes.map((note) => [note.id, getOutgoingLinks(vaultPath, note.id)]))
      const bridges = findKnowledgeBridgeNotes({
        notes,
        outgoingLinksByNoteId,
        propertyRows: getPropertyRows(vaultPath),
        query,
        limit
      })
      return {
        content: formatKnowledgeBridgesToolResult(bridges),
        sources: bridges.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `Bridge score: ${note.score}; folders: ${note.folders.join(', ')}; tags: ${note.tags.join(', ')}`.slice(0, 100),
          score: note.score
        }))
      }
    }
    case 'plan_knowledge_maintenance': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const type = normalizeMaintenanceType(args.type)
      const limit = normalizeToolLimit(args.limit)
      const minCharacters = normalizeMinCharacters(args.minCharacters)
      const upcomingDays = normalizeUpcomingDays(args.upcomingDays)
      const requiredProperties = normalizeMaintenanceProperties(args.requiredProperties)
      const notes = getAllNotes(vaultPath)
      const propertyRows = getPropertyRows(vaultPath)
      const propertyRowsByPath = new Map(propertyRows.map((row) => [row.filePath, row.properties]))
      const outgoingLinksByNoteId = new Map(notes.map((note) => [note.id, getOutgoingLinks(vaultPath, note.id)]))
      const tasks = getAllTasks(vaultPath)
      const todayIso = localDateIso()
      const taskIndex = indexTasksByPath(tasks, todayIso, upcomingDays)
      const openTaskCountByPath = taskIndex.openTaskCountByPath
      const overdueTaskInfoByPath = taskIndex.overdueTaskInfoByPath
      const dueTodayTaskInfoByPath = taskIndex.dueTodayTaskInfoByPath
      const highPriorityTaskInfoByPath = taskIndex.highPriorityTaskInfoByPath
      const scheduledTaskInfoByPath = taskIndex.scheduledTaskInfoByPath
      const startedTaskInfoByPath = taskIndex.startedTaskInfoByPath
      const blockedTaskInfoByPath = taskIndex.blockedTaskInfoByPath
      const recurringTaskInfoByPath = taskIndex.recurringTaskInfoByPath
      const upcomingTaskInfoByPath = taskIndex.upcomingTaskInfoByPath
      const elevatedTaskCountByPath = taskIndex.elevatedTaskCountByPath
      const emptyNotePaths = new Set<string>()
      const largeNoteCharactersByPath = new Map<string, number>()
      for (const note of notes) {
        try {
          const content = readFileSync(join(vaultPath, note.filePath), 'utf-8')
          if (isEmptyMarkdownNote(content)) emptyNotePaths.add(note.filePath)
          if (content.length >= minCharacters) largeNoteCharactersByPath.set(note.filePath, content.length)
        } catch {}
      }
      const titleGroups = new Map<string, { title: string; filePaths: string[] }>()
      for (const note of notes) {
        const key = note.title.trim().toLowerCase()
        if (!key) continue
        const group = titleGroups.get(key) || { title: note.title, filePaths: [] }
        group.filePaths.push(note.filePath)
        titleGroups.set(key, group)
      }
      const duplicateTitleCountByPath = new Map<string, number>()
      for (const group of titleGroups.values()) {
        if (group.filePaths.length < 2) continue
        for (const filePath of group.filePaths) duplicateTitleCountByPath.set(filePath, group.filePaths.length)
      }
      const aliasGroups = new Map<string, { alias: string; filePaths: string[] }>()
      for (const row of propertyRows) {
        for (const alias of getPropertyTextValues(row.properties.aliases)) {
          const key = alias.toLowerCase()
          const group = aliasGroups.get(key) || { alias, filePaths: [] }
          group.filePaths.push(row.filePath)
          aliasGroups.set(key, group)
        }
      }
      const duplicateAliasesByPath = new Map<string, string[]>()
      for (const group of aliasGroups.values()) {
        if (group.filePaths.length < 2) continue
        for (const filePath of group.filePaths) duplicateAliasesByPath.set(filePath, [...(duplicateAliasesByPath.get(filePath) || []), group.alias])
      }
      const missingPropertiesByPath = new Map<string, string[]>()
      if (requiredProperties.length > 0) {
        for (const note of notes) {
          const properties = propertyRowsByPath.get(note.filePath) || {}
          const missing = requiredProperties.filter((key) => !hasNonEmptyProperty(properties, key))
          if (missing.length > 0) missingPropertiesByPath.set(note.filePath, missing)
        }
      }
      const bridges = findKnowledgeBridgeNotes({
        notes,
        outgoingLinksByNoteId,
        propertyRows,
        limit: Math.max(limit, 10)
      })
      const items = buildKnowledgeMaintenanceQueue({
        notes,
        outgoingLinksByNoteId,
        backlinkCountByNoteId: new Map(notes.map((note) => [note.id, getBacklinks(vaultPath, note.id).length])),
        unlinkedMentionCountByNoteId: new Map(notes.map((note) => [note.id, getUnlinkedMentions(vaultPath, note.id).length])),
        memoryStatusByNoteId: new Map(notes.flatMap<[string, 'missing' | 'stale']>((note) => {
          const memory = readMemory(vaultPath, note.id)
          if (!memory) return [[note.id, 'missing' as const]]
          if (memory.contentHash !== note.contentHash) return [[note.id, 'stale' as const]]
          return []
        })),
        duplicateTitleCountByPath,
        duplicateAliasesByPath,
        emptyNotePaths,
        largeNoteCharactersByPath,
        missingPropertiesByPath,
        openTaskCountByPath,
        elevatedTaskCountByPath,
        overdueTaskInfoByPath,
        dueTodayTaskInfoByPath,
        highPriorityTaskInfoByPath,
        scheduledTaskInfoByPath,
        startedTaskInfoByPath,
        blockedTaskInfoByPath,
        recurringTaskInfoByPath,
        upcomingTaskInfoByPath,
        bridges,
        query,
        type,
        limit
      })
      return {
        content: formatKnowledgeMaintenanceQueueToolResult(items),
        sources: items.map((item) => ({
          title: item.title,
          filePath: item.filePath,
          chunk: `${item.action}: ${item.reason}`.slice(0, 100),
          score: item.priority
        }))
      }
    }
    case 'list_untagged_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getPropertyRows(vaultPath)
        .filter((row) => !hasPropertyTags(row.properties.tags))
        .filter((row) => !query || [row.title, row.filePath].some((value) => value.toLowerCase().includes(query)))
        .map((row) => ({ title: row.title, filePath: row.filePath, updatedAt: row.updatedAt }))
        .slice(0, limit)
      return {
        content: formatUntaggedNotesToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: 'Untagged note',
          score: 1
        }))
      }
    }
    case 'list_empty_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const notes = getAllNotes(vaultPath)
        .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
        .filter((note) => {
          try {
            return isEmptyMarkdownNote(readFileSync(join(vaultPath, note.filePath), 'utf-8'))
          } catch {
            return false
          }
        })
        .slice(0, limit)
      return {
        content: formatEmptyNotesToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: 'Empty note',
          score: 1
        }))
      }
    }
    case 'list_large_notes': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const minCharacters = normalizeMinCharacters(args.minCharacters)
      const notes = getAllNotes(vaultPath)
        .filter((note) => !query || [note.title, note.filePath].some((value) => value.toLowerCase().includes(query)))
        .map((note) => {
          try {
            const content = readFileSync(join(vaultPath, note.filePath), 'utf-8')
            return { title: note.title, filePath: note.filePath, updatedAt: note.updatedAt, characters: content.length }
          } catch {
            return null
          }
        })
        .filter((note): note is { title: string; filePath: string; updatedAt: number; characters: number } => note !== null && note.characters >= minCharacters)
        .sort((a, b) => b.characters - a.characters || b.updatedAt - a.updatedAt)
        .slice(0, limit)
      return {
        content: formatLargeNotesToolResult(notes),
        sources: notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `Large note: ${note.characters} characters`,
          score: 1
        }))
      }
    }
    case 'list_duplicate_note_titles': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const groups = new Map<string, { title: string; filePaths: string[] }>()
      for (const note of getAllNotes(vaultPath)) {
        const key = note.title.trim().toLowerCase()
        if (!key) continue
        const group = groups.get(key) || { title: note.title, filePaths: [] }
        group.filePaths.push(note.filePath)
        groups.set(key, group)
      }
      const duplicates = Array.from(groups.values())
        .filter((group) => group.filePaths.length > 1)
        .filter((group) => !query || group.title.toLowerCase().includes(query) || group.filePaths.some((filePath) => filePath.toLowerCase().includes(query)))
        .sort((a, b) => b.filePaths.length - a.filePaths.length || a.title.localeCompare(b.title))
        .slice(0, limit)
      return {
        content: formatDuplicateNoteTitlesToolResult(duplicates),
        sources: duplicates.flatMap((group) => group.filePaths.map((filePath) => ({
          title: group.title,
          filePath,
          chunk: `Duplicate title: ${group.title}`,
          score: 1
        })))
      }
    }
    case 'list_duplicate_aliases': {
      const query = getStringArg(args, 'query').trim().toLowerCase()
      const limit = normalizeToolLimit(args.limit)
      const groups = new Map<string, { alias: string; notes: { title: string; filePath: string }[] }>()
      for (const row of getPropertyRows(vaultPath)) {
        for (const alias of getPropertyTextValues(row.properties.aliases)) {
          const key = alias.toLowerCase()
          const group = groups.get(key) || { alias, notes: [] }
          group.notes.push({ title: row.title, filePath: row.filePath })
          groups.set(key, group)
        }
      }
      const duplicates = Array.from(groups.values())
        .filter((group) => group.notes.length > 1)
        .filter((group) => !query || group.alias.toLowerCase().includes(query) || group.notes.some((note) => [note.title, note.filePath].some((value) => value.toLowerCase().includes(query))))
        .sort((a, b) => b.notes.length - a.notes.length || a.alias.localeCompare(b.alias))
        .slice(0, limit)
      return {
        content: formatDuplicateAliasesToolResult(duplicates),
        sources: duplicates.flatMap((group) => group.notes.map((note) => ({
          title: note.title,
          filePath: note.filePath,
          chunk: `Duplicate alias: ${group.alias}`,
          score: 1
        })))
      }
    }
    case 'create_note': {
      return { content: '普通 Agent 对话不能直接创建笔记。请切换到编辑模式，生成内容会先展示预览并等待确认。' }
    }
    case 'edit_note': {
      return { content: '普通 Agent 对话不能直接修改笔记。请切换到编辑模式，修改会先展示 Diff 并等待确认。' }
    }
    default:
      return { content: `未知工具: ${name}` }
  }
}
