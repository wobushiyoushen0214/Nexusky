import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve, relative } from 'path'
import { randomUUID } from 'crypto'
import { Worker } from 'worker_threads'
import { indexNote, removeNoteIndex, getAllNotes, getPropertyRows, getOutgoingLinks, getBacklinks, getUnlinkedMentions, getGraphData, getAllTags, getNotesByTag, getAllTasks } from '../services/indexer'
import { getDatabase, closeDatabase } from '../services/database'
import { lexicalSearch, indexNoteSearchChunks, invalidateSearchIndexCache } from '../services/search-index'
import { pushIndex } from '../services/cloud/manager'
import { aiManager } from '../services/ai'
import { extractJsonFromText } from '../services/ai/json'
import { collectDueFlashcardsFromNotes, getLocalDateFromStamp, getLocalDateStamp, parseFlashcardsFromMarkdown, reviewFlashcardInMarkdown } from '../services/ai/flashcards'
import { finishAiTask, startAiTask } from '../services/ai-task-control'
import { collectMarkdownFiles, indexVault, type VaultIndexProgress, type VaultIndexResult } from '../services/vault-indexer'
import { getCachedVaultQuery } from '../services/db-query-cache'
import { ensureBoundedString, ensureNonEmptyString, ensureOptionalBoundedString, MAX_DESCRIPTION_LENGTH, MAX_PATH_LENGTH, MAX_TITLE_LENGTH } from './validators'
import { getErrorMessage as getErrorMessageShared } from '@shared/utils/errors'
import type { GraphMode } from '@shared/types/ipc'
import { searchNotes } from '../services/note-search'
import { extractBlockedTaskSignal, extractHighTaskPriority, extractRecurringTaskSignal, extractTaskDueDate, extractTaskScheduledDate, extractTaskStartDate } from '../services/ai/maintenance-queue'
import { getContextSuggestions, refreshRelationScores, submitRelationFeedback } from '../services/long-context/relation-store'
import { extractLongTermThemes, getLongTermThemes } from '../services/long-context/theme-extractor'
import { generateCognitiveReview } from '../services/long-context/cognitive-review'
import { getLongContextMetrics, recordContextEvent } from '../services/long-context/context-events'
import { discoverLongContextRelations } from '../services/long-context/relation-discovery'
import { scheduleIndexedNoteLongContext, scheduleLongContextAnalysis, scheduleVaultLongContextMaintenance } from '../services/long-context/background'
import { getLongContextPrefs, setLongContextPrefs } from '../services/long-context/long-context-prefs'
import { buildLongContextPack, type LongContextPackItem } from '../services/long-context/context-pack-builder'
import { runProactiveCycle } from '../services/proactive/proactive-orchestrator'
import { createHash } from 'crypto'
import type Database from 'better-sqlite3'
import type { AppLanguage, ChatHistoryEntry, ChatHistoryRole, ChatSource, FlashcardQueueItem, FlashcardReviewRating, KanbanAiPlan, KanbanColumn, LongContextCognitiveReviewResult, LongContextEntityType, LongContextFeedbackType, LongContextInspection, LongContextMetrics, LongContextPackItemPayload, LongContextRelationRefreshResult, LongContextRelationType, LongContextSuggestion, LongContextUserPrefs, LongTermTheme, SearchIndexStatus } from '@shared/types/ipc'
import { resolveAppLanguage } from '../services/app-language'

type KanbanRelationType = KanbanAiPlan['relations'][number]['relationType']
type KanbanTaskInput = KanbanAiPlan['tasks'][number]
type KanbanRelationInput = KanbanAiPlan['relations'][number]
type KanbanColumnRow = KanbanColumn
type SqlValue = string | number | null

function resolveNoteId(vaultPath: string, params: { noteId?: string; filePath?: string }): string | null {
  if (params.noteId) return params.noteId
  if (!params.filePath) return null
  const relPath = params.filePath.replace(vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
  const db = getDatabase(vaultPath)
  const row = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(relPath) as { id: string } | undefined
  return row?.id || null
}

function getErrorMessage(error: unknown, fallback = ''): string {
  return getErrorMessageShared(error, fallback)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function normalizeChatRole(role: string): ChatHistoryRole {
  return role === 'user' ? 'user' : 'assistant'
}

function parseChatSources(raw: string | null): ChatSource[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return undefined
    return parsed.filter((source): source is ChatSource => (
      typeof source?.title === 'string' &&
      typeof source?.filePath === 'string' &&
      typeof source?.chunk === 'string' &&
      typeof source?.score === 'number'
    ))
  } catch {
    return undefined
  }
}

function ensureLongContextEntityType(value: unknown, field: string): LongContextEntityType {
  if (!LONG_CONTEXT_ENTITY_TYPES.has(value as LongContextEntityType)) {
    throw new Error(`Invalid IPC payload: ${field} must be one of note, task, chat`)
  }
  return value as LongContextEntityType
}

function ensureLongContextFeedbackType(value: unknown, field: string): LongContextFeedbackType {
  if (!LONG_CONTEXT_FEEDBACK_TYPES.has(value as LongContextFeedbackType)) {
    throw new Error(`Invalid IPC payload: ${field} must be a valid long-context feedback type`)
  }
  return value as LongContextFeedbackType
}

function normalizeLongContextLimit(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(Math.floor(value), 20))
}

function normalizeLongContextRefreshLimit(value: unknown): number {
  if (value === undefined || value === null) return 500
  if (typeof value !== 'number' || !Number.isFinite(value)) return 500
  return Math.max(1, Math.min(Math.floor(value), 2000))
}

function ensureOptionalUnixSeconds(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid IPC payload: ${field} must be a positive unix timestamp`)
  }
  return Math.floor(value)
}

function recordSuggestionShownEvents(params: {
  vaultPath: string
  entityType: LongContextEntityType
  entityId: string
  suggestions: LongContextSuggestion[]
}): void {
  const now = Math.floor(Date.now() / 1000)
  for (const suggestion of params.suggestions) {
    recordContextEvent({
      vaultPath: params.vaultPath,
      eventType: 'suggestion_shown',
      entityType: params.entityType,
      entityId: params.entityId,
      entityTitle: suggestion.targetTitle,
      entityPath: suggestion.targetPath,
      metadata: {
        relationId: suggestion.relationId,
        targetType: suggestion.targetType,
        targetId: suggestion.targetId,
        relationType: suggestion.relationType,
        score: suggestion.score,
        confidence: suggestion.confidence
      },
      createdAt: now
    })
  }
}

type SearchIndexJobStatus = SearchIndexStatus

type SearchIndexBuildResult = {
  indexed: number
}

type SearchIndexProgressPublisher = (status: SearchIndexStatus) => void

type SearchIndexBuildParams = {
  vaultPath: string
  publishProgress: SearchIndexProgressPublisher
}

interface KanbanTaskRow {
  id: string
  columnId: string
  title: string
  description: string
  sortOrder: number
  priority: number
  dueDate: string | null
  sourceNoteId?: string | null
  sourceFilePath?: string | null
  sourceTitle?: string | null
  createdAt: number
  updatedAt: number
}

interface KanbanRelationRow {
  id: string
  sourceTaskId: string
  targetTaskId: string
  relationType: KanbanRelationType
}

interface IndexedTaskRow {
  text: string
  done: boolean
  noteTitle: string
  filePath: string
}

const RELATION_TYPES = new Set<KanbanRelationType>(['blocks', 'depends_on', 'related'])
const FLASHCARD_RATINGS = new Set<FlashcardReviewRating>(['again', 'hard', 'good', 'easy'])
const LONG_CONTEXT_ENTITY_TYPES = new Set<LongContextEntityType>(['note', 'task', 'chat'])
const LONG_CONTEXT_FEEDBACK_TYPES = new Set<LongContextFeedbackType>(['useful', 'not_related', 'wrong_reason', 'dismissed'])
const searchIndexJobs = new Map<string, SearchIndexJobStatus>()

function runIndexVaultWorker(vaultPath: string, onProgress: (progress: VaultIndexProgress) => void): Promise<VaultIndexResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'indexVaultWorker.js'), { workerData: { vaultPath } })
    let settled = false
    worker.on('message', (message: { type?: string; current?: number; total?: number; indexed?: number; error?: string }) => {
      if (message.type === 'progress') {
        onProgress({ current: message.current || 0, total: message.total || 0 })
      } else if (message.type === 'done') {
        settled = true
        resolve({ indexed: message.indexed || 0 })
      } else if (message.type === 'error') {
        settled = true
        reject(new Error(message.error || '索引 Worker 执行失败'))
      }
    })
    worker.on('error', (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    })
    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        settled = true
        reject(new Error(`索引 Worker 退出码 ${code}`))
      }
    })
  })
}

export function registerDbIPC(): void {
  ipcMain.handle('db:index-vault', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const onProgress = (progress: VaultIndexProgress) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('db:index-progress', progress)
      }
    }
    try {
      const result = process.env.NEXUSKY_DISABLE_INDEX_WORKER === '1'
        ? await indexVault(params.vaultPath, onProgress)
        : await runIndexVaultWorker(params.vaultPath, onProgress)
      invalidateSearchIndexCache()
      scheduleVaultLongContextMaintenance(params.vaultPath)
      return result
    } finally {
      closeDatabase()
    }
  })

  ipcMain.handle('db:index-file', async (_event, params: { vaultPath: string; filePath: string }) => {
    indexNote(params.vaultPath, params.filePath)
    scheduleIndexedNoteLongContext({
      vaultPath: params.vaultPath,
      filePath: params.filePath,
      eventType: 'note_updated',
      trigger: 'db:index-file'
    })

    const relPath = relative(params.vaultPath, params.filePath).replace(/\\/g, '/')
    const noteId = createHash('md5').update(relPath).digest('hex')
    try {
      runProactiveCycle({
        vaultPath: params.vaultPath,
        entityType: 'note',
        entityId: noteId,
        trigger: 'overdue_task_burst'
      })
      runProactiveCycle({
        vaultPath: params.vaultPath,
        entityType: 'note',
        entityId: noteId,
        trigger: 'stale_island_note'
      })
    } catch {
      // Proactive evaluation must never break note indexing.
    }
  })

  ipcMain.handle('db:remove-file', async (_event, params: { vaultPath: string; filePath: string }) => {
    removeNoteIndex(params.vaultPath, params.filePath)
  })

  ipcMain.handle('db:remove-folder', async (_event, params: { vaultPath: string; folderPath: string }) => {
    const db = getDatabase(params.vaultPath)
    const { relative } = require('path')
    const relFolder = relative(params.vaultPath, params.folderPath).replace(/\\/g, '/') + '/'
    const notes = db.prepare("SELECT id, file_path FROM notes WHERE file_path LIKE ?").all(relFolder + '%') as { id: string; file_path: string }[]
    for (const note of notes) {
      removeNoteIndex(params.vaultPath, join(params.vaultPath, note.file_path))
    }
  })

  ipcMain.handle('db:get-all-notes', async (_event, params: { vaultPath: string }) => {
    return getCachedVaultQuery(params.vaultPath, 'all-notes', () => getAllNotes(params.vaultPath))
  })

  ipcMain.handle('db:get-property-rows', async (_event, params: { vaultPath: string }) => {
    return getCachedVaultQuery(params.vaultPath, 'property-rows', () => getPropertyRows(params.vaultPath))
  })

  ipcMain.handle('db:get-recent-notes', async (_event, params: { vaultPath: string; limit?: number }) => {
    const limit = params.limit || 50
    return getCachedVaultQuery(params.vaultPath, `recent:${limit}`, () => {
      const db = getDatabase(params.vaultPath)
      return db.prepare(
        'SELECT id, title, file_path as filePath, created_at as createdAt, updated_at as updatedAt FROM notes ORDER BY updated_at DESC LIMIT ?'
      ).all(limit)
    })
  })

  ipcMain.handle('db:get-outgoing-links', async (_event, params: { vaultPath: string; noteId?: string; filePath?: string }) => {
    const noteId = resolveNoteId(params.vaultPath, params)
    return noteId ? getCachedVaultQuery(params.vaultPath, `outgoing:${noteId}`, () => getOutgoingLinks(params.vaultPath, noteId)) : []
  })

  ipcMain.handle('db:get-backlinks', async (_event, params: { vaultPath: string; noteId?: string; filePath?: string }) => {
    const noteId = resolveNoteId(params.vaultPath, params)
    return noteId ? getCachedVaultQuery(params.vaultPath, `backlinks:${noteId}`, () => getBacklinks(params.vaultPath, noteId)) : []
  })

  ipcMain.handle('db:get-unlinked-mentions', async (_event, params: { vaultPath: string; noteId?: string; filePath?: string }) => {
    const noteId = resolveNoteId(params.vaultPath, params)
    return noteId ? getCachedVaultQuery(params.vaultPath, `unlinked:${noteId}`, () => getUnlinkedMentions(params.vaultPath, noteId)) : []
  })

  ipcMain.handle('db:get-graph', async (_event, params: { vaultPath: string; mode?: GraphMode; rootPath?: string }) => {
    const mode: GraphMode = params.mode ?? 'folder'
    const rootPath = params.rootPath ?? ''
    return getCachedVaultQuery(params.vaultPath, `graph:${mode}:${rootPath}`, () => getGraphData(params.vaultPath, mode, rootPath), 60_000)
  })

  ipcMain.handle('db:search-notes', async (_event, params: { vaultPath: string; query: string }) => {
    return searchNotes(params.vaultPath, params.query)
  })

  ipcMain.handle('db:lexical-search', async (_event, params: { vaultPath: string; query: string }) => {
    return lexicalSearch(params.vaultPath, params.query)
  })

  ipcMain.handle('db:fulltext-search', async (_event, params: { vaultPath: string; query: string; regex?: boolean }) => {
    const db = getDatabase(params.vaultPath)
    const ftsQuery = params.query.replace(/['"]/g, '').trim()
    if (!ftsQuery) return []

    if (params.regex) {
      const files = collectMarkdownFiles(params.vaultPath)
      const results: { filePath: string; title: string; line: string; lineNumber: number }[] = []
      let re: RegExp
      try { re = new RegExp(ftsQuery, 'i') } catch { return [] }

      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')
        const relPath = file.replace(params.vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
        const title = lines.find((l) => l.startsWith('# '))?.replace(/^#\s+/, '') || relPath.replace(/\.md$/, '')

        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            results.push({ filePath: relPath, title, line: lines[i].trim(), lineNumber: i + 1 })
            if (results.length >= 50) return results
          }
        }
      }
      return results
    }

    try {
      return db.prepare(`
        SELECT n.file_path as filePath, n.title, snippet(notes_fts, 1, '<<', '>>', '...', 32) as line, 0 as lineNumber
        FROM notes_fts
        JOIN notes_fts_map m ON m.rowid = notes_fts.rowid
        JOIN notes n ON n.id = m.note_id
        WHERE notes_fts MATCH ?
        ORDER BY rank
        LIMIT 50
      `).all(ftsQuery)
    } catch {
      const files = collectMarkdownFiles(params.vaultPath)
      const results: { filePath: string; title: string; line: string; lineNumber: number }[] = []
      const query = params.query.toLowerCase()

      for (const file of files) {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')
        const relPath = file.replace(params.vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
        const title = lines.find((l) => l.startsWith('# '))?.replace(/^#\s+/, '') || relPath.replace(/\.md$/, '')

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query)) {
            results.push({ filePath: relPath, title, line: lines[i].trim(), lineNumber: i + 1 })
            if (results.length >= 50) return results
          }
        }
      }
      return results
    }
  })

  ipcMain.handle('db:get-tags', async (_event, params: { vaultPath: string }) => {
    return getCachedVaultQuery(params.vaultPath, 'tags', () => getAllTags(params.vaultPath))
  })

  ipcMain.handle('db:get-notes-by-tag', async (_event, params: { vaultPath: string; tag: string }) => {
    return getCachedVaultQuery(params.vaultPath, `tag:${params.tag}`, () => getNotesByTag(params.vaultPath, params.tag))
  })

  ipcMain.handle('flashcards:list-due', async (_event, params: { vaultPath: string; today?: string; limit?: number }) => {
    const notes = getAllNotes(params.vaultPath).flatMap((note) => {
      try {
        const fullPath = join(params.vaultPath, note.filePath)
        return [{ title: note.title, filePath: note.filePath, content: readFileSync(fullPath, 'utf-8') }]
      } catch {
        return []
      }
    })
    return collectDueFlashcardsFromNotes(notes, params.today || getLocalDateStamp(), params.limit)
  })

  ipcMain.handle('flashcards:review', async (event, params: { vaultPath: string; filePath: string; startLine: number; rating: FlashcardReviewRating; reviewedAt?: string }) => {
    if (!FLASHCARD_RATINGS.has(params.rating)) return { ok: false, error: '无效的复习评分' }

    const fullPath = resolve(params.vaultPath, params.filePath)
    const relPath = relative(params.vaultPath, fullPath)
    if (relPath.startsWith('..') || relPath === '' || resolve(params.vaultPath) === fullPath) {
      return { ok: false, error: '路径不在当前笔记空间内' }
    }
    const normalizedRelPath = relPath.replace(/\\/g, '/')

    try {
      const current = readFileSync(fullPath, 'utf-8')
      const reviewedAt = params.reviewedAt ? getLocalDateFromStamp(params.reviewedAt) : new Date()
      const next = reviewFlashcardInMarkdown(current, params.startLine, params.rating, reviewedAt)
      writeFileSync(fullPath, next, 'utf-8')
      indexNote(params.vaultPath, fullPath)
      invalidateSearchIndexCache()
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) win.webContents.send('vault:files-changed')

      const reviewedCard = parseFlashcardsFromMarkdown(next).find((card) => card.startLine === params.startLine)
      const row = getAllNotes(params.vaultPath).find((note) => note.filePath === normalizedRelPath)
      const card: FlashcardQueueItem | undefined = reviewedCard ? { ...reviewedCard, title: row?.title || normalizedRelPath.replace(/\.md$/, ''), filePath: normalizedRelPath } : undefined
      return { ok: true, card }
    } catch (error) {
      return { ok: false, error: getErrorMessage(error, '闪卡复习写回失败') }
    }
  })

  ipcMain.handle('db:get-tasks', async (_event, params: { vaultPath: string }) => {
    return getAllTasks(params.vaultPath)
  })

  // Kanban: columns
  ipcMain.handle('kanban:get-columns', async (_event, params: { vaultPath: string }) => {
    const db = getDatabase(params.vaultPath)
    return db.prepare('SELECT id, name, sort_order as sortOrder FROM kanban_columns ORDER BY sort_order ASC').all()
  })

  ipcMain.handle('kanban:create-column', async (_event, params: { vaultPath: string; id: string; name: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'kanban:create-column.vaultPath')
    ensureNonEmptyString(params?.id, 'kanban:create-column.id')
    ensureNonEmptyString(params?.name, 'kanban:create-column.name', MAX_TITLE_LENGTH)
    const db = getDatabase(params.vaultPath)
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM kanban_columns').get() as { m: number | null }
    db.prepare('INSERT INTO kanban_columns (id, name, sort_order) VALUES (?, ?, ?)').run(params.id, params.name, (maxOrder.m ?? -1) + 1)
  })

  ipcMain.handle('kanban:rename-column', async (_event, params: { vaultPath: string; id: string; name: string }) => {
    ensureNonEmptyString(params?.vaultPath, 'kanban:rename-column.vaultPath')
    ensureNonEmptyString(params?.id, 'kanban:rename-column.id')
    ensureNonEmptyString(params?.name, 'kanban:rename-column.name', MAX_TITLE_LENGTH)
    const db = getDatabase(params.vaultPath)
    db.prepare('UPDATE kanban_columns SET name = ? WHERE id = ?').run(params.name, params.id)
  })

  ipcMain.handle('kanban:delete-column', async (_event, params: { vaultPath: string; id: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('DELETE FROM kanban_columns WHERE id = ?').run(params.id)
  })

  ipcMain.handle('kanban:reorder-columns', async (_event, params: { vaultPath: string; columnIds: string[] }) => {
    const db = getDatabase(params.vaultPath)
    const stmt = db.prepare('UPDATE kanban_columns SET sort_order = ? WHERE id = ?')
    const tx = db.transaction(() => {
      params.columnIds.forEach((id, i) => stmt.run(i, id))
    })
    tx()
  })

  // Kanban: tasks
  ipcMain.handle('kanban:get-tasks', async (_event, params: { vaultPath: string }) => {
    const db = getDatabase(params.vaultPath)
    return db.prepare(`
      SELECT t.id, t.column_id as columnId, t.title, t.description, t.sort_order as sortOrder,
             t.priority, t.due_date as dueDate, t.source_note_id as sourceNoteId,
             t.source_file_path as sourceFilePath, n.title as sourceTitle,
             t.created_at as createdAt, t.updated_at as updatedAt
      FROM kanban_tasks t
      LEFT JOIN notes n ON n.id = t.source_note_id
      ORDER BY t.column_id ASC, t.sort_order ASC, t.created_at ASC
    `).all() as KanbanTaskRow[]
  })

  ipcMain.handle('kanban:import-indexed-tasks', async (_event, params: { vaultPath: string; columnId?: string; preview?: boolean; limit?: number; plan?: KanbanAiPlan }) => {
    const db = getDatabase(params.vaultPath)
    const targetColumnId = params.columnId || getFirstKanbanColumnId(db)
    const limit = Math.max(1, Math.min(50, Math.floor(params.limit || 30)))
    const plan = params.plan ? normalizeKanbanAiPlan(params.plan, 50) : (() => {
      const noteRows = db.prepare('SELECT id, file_path as filePath FROM notes').all() as { id: string; filePath: string }[]
      const noteIdByPath = new Map(noteRows.map((note) => [note.filePath, note.id]))
      const existingRows = db.prepare('SELECT title, source_file_path as sourceFilePath FROM kanban_tasks WHERE source_file_path IS NOT NULL').all() as { title: string; sourceFilePath: string | null }[]
      const existingKeys = new Set(existingRows.map((task) => normalizeKanbanTaskKey(task.sourceFilePath, task.title)))
      return {
        tasks: getAllTasks(params.vaultPath)
          .filter((task) => !task.done)
          .map((task) => buildKanbanTaskFromIndexedTask(task, noteIdByPath.get(task.filePath) || null))
          .filter((task) => !existingKeys.has(normalizeKanbanTaskKey(task.sourceFilePath, task.title)))
          .slice(0, limit),
        relations: []
      }
    })()
    if (params.preview) {
      return { plan, tasks: plan.tasks, relations: plan.relations, summary: `将导入 ${plan.tasks.length} 个 Markdown 待办` }
    }
    const created = createKanbanTasks(db, targetColumnId, plan.tasks)
    return { tasks: created, relations: [], summary: `已导入 ${created.length} 个 Markdown 待办` }
  })

  ipcMain.handle('kanban:create-task', async (_event, params: { vaultPath: string; id: string; columnId: string; title: string; description?: string; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }) => {
    ensureNonEmptyString(params?.vaultPath, 'kanban:create-task.vaultPath')
    ensureNonEmptyString(params?.id, 'kanban:create-task.id')
    ensureNonEmptyString(params?.columnId, 'kanban:create-task.columnId')
    ensureNonEmptyString(params?.title, 'kanban:create-task.title', MAX_TITLE_LENGTH)
    ensureOptionalBoundedString(params?.description, 'kanban:create-task.description', MAX_DESCRIPTION_LENGTH)
    const db = getDatabase(params.vaultPath)
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM kanban_tasks WHERE column_id = ?').get(params.columnId) as { m: number | null }
    db.prepare(`
      INSERT INTO kanban_tasks (id, column_id, title, description, sort_order, priority, due_date, source_note_id, source_file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(params.id, params.columnId, params.title.trim(), params.description || '', (maxOrder.m ?? -1) + 1, params.priority || 0, params.dueDate || null, params.sourceNoteId || null, params.sourceFilePath || null)
    scheduleLongContextAnalysis({
      vaultPath: params.vaultPath,
      entityType: 'task',
      entityId: params.id,
      content: `${params.title.trim()}\n${params.description || ''}`.trim(),
      eventType: 'task_created',
      trigger: 'kanban:create-task'
    })
  })

  ipcMain.handle('kanban:update-task', async (_event, params: { vaultPath: string; id: string; title?: string; description?: string; columnId?: string; sortOrder?: number; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }) => {
    ensureNonEmptyString(params?.vaultPath, 'kanban:update-task.vaultPath')
    ensureNonEmptyString(params?.id, 'kanban:update-task.id')
    if (params.title !== undefined) ensureBoundedString(params.title, 'kanban:update-task.title', MAX_TITLE_LENGTH)
    if (params.description !== undefined) ensureBoundedString(params.description, 'kanban:update-task.description', MAX_DESCRIPTION_LENGTH)
    const db = getDatabase(params.vaultPath)
    const sets: string[] = []
    const values: SqlValue[] = []
    if (params.title !== undefined) { sets.push('title = ?'); values.push(params.title) }
    if (params.description !== undefined) { sets.push('description = ?'); values.push(params.description) }
    if (params.columnId !== undefined) { sets.push('column_id = ?'); values.push(params.columnId) }
    if (params.sortOrder !== undefined) { sets.push('sort_order = ?'); values.push(params.sortOrder) }
    if (params.priority !== undefined) { sets.push('priority = ?'); values.push(params.priority) }
    if (params.dueDate !== undefined) { sets.push('due_date = ?'); values.push(params.dueDate) }
    if (params.sourceNoteId !== undefined) { sets.push('source_note_id = ?'); values.push(params.sourceNoteId) }
    if (params.sourceFilePath !== undefined) { sets.push('source_file_path = ?'); values.push(params.sourceFilePath) }
    if (sets.length === 0) return
    sets.push('updated_at = unixepoch()')
    values.push(params.id)
    db.prepare(`UPDATE kanban_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    const task = db.prepare('SELECT title, description FROM kanban_tasks WHERE id = ?').get(params.id) as { title: string; description: string | null } | undefined
    if (task) {
      scheduleLongContextAnalysis({
        vaultPath: params.vaultPath,
        entityType: 'task',
        entityId: params.id,
        content: `${task.title}\n${task.description || ''}`.trim(),
        eventType: 'task_updated',
        trigger: 'kanban:update-task'
      })
    }
  })

  ipcMain.handle('kanban:delete-task', async (_event, params: { vaultPath: string; id: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('DELETE FROM kanban_tasks WHERE id = ?').run(params.id)
  })

  ipcMain.handle('kanban:move-task', async (_event, params: { vaultPath: string; taskId: string; columnId: string; sortOrder: number }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('UPDATE kanban_tasks SET column_id = ?, sort_order = ?, updated_at = unixepoch() WHERE id = ?').run(params.columnId, params.sortOrder, params.taskId)
  })

  ipcMain.handle('kanban:reorder-tasks', async (_event, params: { vaultPath: string; moves: { id: string; columnId: string; sortOrder: number }[] }) => {
    const db = getDatabase(params.vaultPath)
    const stmt = db.prepare('UPDATE kanban_tasks SET column_id = ?, sort_order = ?, updated_at = unixepoch() WHERE id = ?')
    const tx = db.transaction(() => {
      for (const move of params.moves) {
        stmt.run(move.columnId, move.sortOrder, move.id)
      }
    })
    tx()
  })

  // Kanban: task relations
  ipcMain.handle('kanban:get-relations', async (_event, params: { vaultPath: string; taskId?: string }) => {
    const db = getDatabase(params.vaultPath)
    if (params.taskId) {
      return db.prepare(`
        SELECT id, source_task_id as sourceTaskId, target_task_id as targetTaskId, relation_type as relationType
        FROM kanban_task_relations
        WHERE source_task_id = ? OR target_task_id = ?
      `).all(params.taskId, params.taskId)
    }
    return db.prepare('SELECT id, source_task_id as sourceTaskId, target_task_id as targetTaskId, relation_type as relationType FROM kanban_task_relations').all() as KanbanRelationRow[]
  })

  ipcMain.handle('kanban:create-relation', async (_event, params: { vaultPath: string; id: string; sourceTaskId: string; targetTaskId: string; relationType: KanbanRelationType }) => {
    ensureNonEmptyString(params?.vaultPath, 'kanban:create-relation.vaultPath')
    ensureNonEmptyString(params?.id, 'kanban:create-relation.id')
    ensureNonEmptyString(params?.sourceTaskId, 'kanban:create-relation.sourceTaskId')
    ensureNonEmptyString(params?.targetTaskId, 'kanban:create-relation.targetTaskId')
    const db = getDatabase(params.vaultPath)
    if (params.sourceTaskId === params.targetTaskId) throw new Error('任务不能关联自身')
    if (!RELATION_TYPES.has(params.relationType)) throw new Error('无效的任务关系类型')
    db.prepare('INSERT INTO kanban_task_relations (id, source_task_id, target_task_id, relation_type) VALUES (?, ?, ?, ?)').run(params.id, params.sourceTaskId, params.targetTaskId, params.relationType)
  })

  ipcMain.handle('kanban:delete-relation', async (_event, params: { vaultPath: string; id: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('DELETE FROM kanban_task_relations WHERE id = ?').run(params.id)
  })

  ipcMain.handle('kanban:ai-analyze', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('窗口不存在')
    const controller = startAiTask(window.id)
    const board = getKanbanSnapshot(params.vaultPath)
    try {
      const text = await runKanbanAi(
        '你是项目管理助手。请根据看板状态给出简洁的项目进度总结、风险、建议的处理顺序。输出中文，使用短段落和项目符号。',
        JSON.stringify(board, null, 2),
        controller.signal
      )
      return { summary: text }
    } finally {
      finishAiTask(window.id, controller)
    }
  })

  ipcMain.handle('kanban:ai-breakdown-task', async (event, params: { vaultPath: string; taskId?: string; title: string; description?: string; columnId?: string; preview?: boolean; plan?: KanbanAiPlan }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('窗口不存在')
    const controller = startAiTask(window.id)
    const db = getDatabase(params.vaultPath)
    const targetColumnId = params.columnId || getFirstKanbanColumnId(db)
    try {
      let plan = params.plan ? normalizeKanbanAiPlan(params.plan) : null
      if (!plan) {
        const raw = await runKanbanAi(
          `你是任务拆解助手。把输入的大任务拆成 3-8 个可执行子任务，并建立依赖关系。
只输出 JSON，不要 Markdown。格式：
{"tasks":[{"title":"任务名","description":"说明","priority":0-3,"dueDate":null}],"relations":[{"sourceIndex":0,"targetIndex":1,"relationType":"blocks|depends_on|related"}]}`,
          `大任务：${params.title}\n说明：${params.description || ''}`,
          controller.signal
        )
        plan = parseKanbanAiJson(raw)
      }
      if (params.preview) {
        return { plan, tasks: plan.tasks, relations: plan.relations, summary: `将生成 ${plan.tasks.length} 个子任务` }
      }
      const created = createKanbanTasks(db, targetColumnId, plan.tasks)
      const relations = createIndexedRelations(db, created, plan.relations)
      if (params.taskId) {
        for (const task of created) {
          const id = randomUUID()
          db.prepare('INSERT INTO kanban_task_relations (id, source_task_id, target_task_id, relation_type) VALUES (?, ?, ?, ?)').run(id, params.taskId, task.id, 'related')
          relations.push({ id, sourceTaskId: params.taskId, targetTaskId: task.id, relationType: 'related' })
        }
      }
      return { tasks: created, relations, summary: `已生成 ${created.length} 个子任务` }
    } finally {
      finishAiTask(window.id, controller)
    }
  })

  ipcMain.handle('kanban:ai-from-note', async (event, params: { vaultPath: string; filePath: string; content?: string; columnId?: string; preview?: boolean; plan?: KanbanAiPlan }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('窗口不存在')
    const controller = startAiTask(window.id)
    const db = getDatabase(params.vaultPath)
    const relPath = toRelativePath(params.vaultPath, params.filePath)
    const note = db.prepare('SELECT id, title FROM notes WHERE file_path = ?').get(relPath) as { id: string; title: string } | undefined
    const content = params.content ?? readFileSync(params.filePath, 'utf-8')
    const targetColumnId = params.columnId || getFirstKanbanColumnId(db)
    try {
      let plan = params.plan ? normalizeKanbanAiPlan(params.plan) : null
      if (!plan) {
        const raw = await runKanbanAi(
          `你是任务提取助手。请从笔记中提取真正需要执行的待办事项，忽略普通描述和已完成事项。
只输出 JSON，不要 Markdown。格式：
{"tasks":[{"title":"任务名","description":"上下文","priority":0-3,"dueDate":null}],"relations":[{"sourceIndex":0,"targetIndex":1,"relationType":"blocks|depends_on|related"}]}`,
          `笔记：${note?.title || relPath}\n\n${content.slice(0, 8000)}`,
          controller.signal
        )
        plan = parseKanbanAiJson(raw)
      }
      if (params.preview) {
        return { plan, tasks: plan.tasks, relations: plan.relations, summary: `将从笔记提取 ${plan.tasks.length} 个任务` }
      }
      const tasks = plan.tasks.map((task) => ({ ...task, sourceNoteId: note?.id || null, sourceFilePath: relPath }))
      const created = createKanbanTasks(db, targetColumnId, tasks)
      const relations = createIndexedRelations(db, created, plan.relations)
      return { tasks: created, relations, summary: `已从笔记提取 ${created.length} 个任务` }
    } finally {
      finishAiTask(window.id, controller)
    }
  })

  ipcMain.handle('db:index-search-note', async (_event, params: { vaultPath: string; noteId: string; content: string }) => {
    await indexNoteSearchChunks(params.vaultPath, params.noteId, params.content)
  })

  ipcMain.handle('db:search-index-status', async (_event, params: { vaultPath: string }) => {
    const running = searchIndexJobs.get(params.vaultPath)
    if (running?.state === 'indexing') return running
    return getSearchIndexStatus(params.vaultPath, running)
  })

  ipcMain.handle('long-context:get-suggestions', async (_event, params: {
    vaultPath: string
    entityType: LongContextEntityType
    entityId: string
    content?: string
    limit?: number
    refresh?: boolean
    language?: AppLanguage
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:get-suggestions.vaultPath')
    const entityType = ensureLongContextEntityType(params?.entityType, 'long-context:get-suggestions.entityType')
    ensureNonEmptyString(params?.entityId, 'long-context:get-suggestions.entityId')
    const content = ensureOptionalBoundedString(params?.content, 'long-context:get-suggestions.content', MAX_DESCRIPTION_LENGTH)
    const limit = normalizeLongContextLimit(params?.limit, 3)
    let suggestions: LongContextSuggestion[]
    if (params?.refresh) {
      suggestions = (await discoverLongContextRelations({
        vaultPath: params.vaultPath,
        entityType,
        entityId: params.entityId,
        content,
        limit,
        language: resolveAppLanguage(params.language)
      })).suggestions
    } else {
      suggestions = getContextSuggestions({
        vaultPath: params.vaultPath,
        entityType,
        entityId: params.entityId,
        limit
      }) as LongContextSuggestion[]
    }
    recordSuggestionShownEvents({
      vaultPath: params.vaultPath,
      entityType,
      entityId: params.entityId,
      suggestions
    })
    return suggestions
  })

  ipcMain.handle('long-context:discover-relations', async (_event, params: {
    vaultPath: string
    entityType: LongContextEntityType
    entityId: string
    content?: string
    limit?: number
    language?: AppLanguage
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:discover-relations.vaultPath')
    const entityType = ensureLongContextEntityType(params?.entityType, 'long-context:discover-relations.entityType')
    ensureNonEmptyString(params?.entityId, 'long-context:discover-relations.entityId')
    const content = ensureOptionalBoundedString(params?.content, 'long-context:discover-relations.content', MAX_DESCRIPTION_LENGTH)
    const result = await discoverLongContextRelations({
      vaultPath: params.vaultPath,
      entityType,
      entityId: params.entityId,
      content,
      limit: params.limit,
      language: resolveAppLanguage(params.language)
    })
    recordSuggestionShownEvents({
      vaultPath: params.vaultPath,
      entityType,
      entityId: params.entityId,
      suggestions: result.suggestions
    })
    return result
  })

  ipcMain.handle('long-context:submit-feedback', async (_event, params: {
    vaultPath: string
    relationId: string
    feedbackType: LongContextFeedbackType
    note?: string
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:submit-feedback.vaultPath')
    ensureNonEmptyString(params?.relationId, 'long-context:submit-feedback.relationId')
    const feedbackType = ensureLongContextFeedbackType(params?.feedbackType, 'long-context:submit-feedback.feedbackType')
    const note = ensureOptionalBoundedString(params?.note, 'long-context:submit-feedback.note', MAX_DESCRIPTION_LENGTH)
    submitRelationFeedback({
      vaultPath: params.vaultPath,
      relationId: params.relationId,
      feedbackType,
      note
    })
    recordContextEvent({
      vaultPath: params.vaultPath,
      eventType: 'relation_feedback_submitted',
      entityType: 'relation',
      entityId: params.relationId,
      contentSnapshot: note,
      metadata: { feedbackType }
    })
  })

  ipcMain.handle('long-context:get-themes', async (_event, params: {
    vaultPath: string
    limit?: number
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:get-themes.vaultPath')
    return getLongTermThemes(params.vaultPath, normalizeLongContextLimit(params?.limit, 20)) as LongTermTheme[]
  })

  ipcMain.handle('long-context:run-theme-extraction', async (_event, params: {
    vaultPath: string
    language?: AppLanguage
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:run-theme-extraction.vaultPath')
    return extractLongTermThemes({ vaultPath: params.vaultPath, language: resolveAppLanguage(params.language) })
  })

  ipcMain.handle('long-context:refresh-relations', async (_event, params: {
    vaultPath: string
    entityType?: LongContextEntityType
    entityId?: string
    limit?: number
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:refresh-relations.vaultPath')
    const entityType = params?.entityType === undefined
      ? undefined
      : ensureLongContextEntityType(params.entityType, 'long-context:refresh-relations.entityType')
    const entityId = params?.entityId === undefined
      ? undefined
      : ensureNonEmptyString(params.entityId, 'long-context:refresh-relations.entityId', MAX_TITLE_LENGTH)
    if ((entityType && !entityId) || (!entityType && entityId)) {
      throw new Error('Invalid IPC payload: long-context:refresh-relations entityType and entityId must be provided together')
    }
    return refreshRelationScores({
      vaultPath: params.vaultPath,
      entityType,
      entityId,
      limit: normalizeLongContextRefreshLimit(params?.limit)
    }) as LongContextRelationRefreshResult
  })

  ipcMain.handle('long-context:generate-cognitive-review', async (_event, params: {
    vaultPath: string
    since?: number
    until?: number
    write?: boolean
    outputPath?: string
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:generate-cognitive-review.vaultPath')
    const since = ensureOptionalUnixSeconds(params?.since, 'long-context:generate-cognitive-review.since')
    const until = ensureOptionalUnixSeconds(params?.until, 'long-context:generate-cognitive-review.until')
    const outputPath = ensureOptionalBoundedString(params?.outputPath, 'long-context:generate-cognitive-review.outputPath', MAX_PATH_LENGTH)
    if (since !== undefined && until !== undefined && since > until) {
      throw new Error('Invalid IPC payload: long-context:generate-cognitive-review.since must be before until')
    }
    return generateCognitiveReview({
      vaultPath: params.vaultPath,
      since,
      until,
      write: Boolean(params?.write),
      outputPath
    }) as LongContextCognitiveReviewResult
  })

  ipcMain.handle('long-context:record-suggestion-opened', async (_event, params: {
    vaultPath: string
    entityType: LongContextEntityType
    entityId: string
    relationId: string
    targetType: LongContextEntityType
    targetId: string
    targetTitle?: string
    targetPath?: string
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:record-suggestion-opened.vaultPath')
    const entityType = ensureLongContextEntityType(params?.entityType, 'long-context:record-suggestion-opened.entityType')
    ensureNonEmptyString(params?.entityId, 'long-context:record-suggestion-opened.entityId')
    ensureNonEmptyString(params?.relationId, 'long-context:record-suggestion-opened.relationId')
    const targetType = ensureLongContextEntityType(params?.targetType, 'long-context:record-suggestion-opened.targetType')
    ensureNonEmptyString(params?.targetId, 'long-context:record-suggestion-opened.targetId')
    const targetTitle = ensureOptionalBoundedString(params?.targetTitle, 'long-context:record-suggestion-opened.targetTitle', MAX_TITLE_LENGTH)
    const targetPath = ensureOptionalBoundedString(params?.targetPath, 'long-context:record-suggestion-opened.targetPath', MAX_PATH_LENGTH)
    recordContextEvent({
      vaultPath: params.vaultPath,
      eventType: 'suggestion_opened',
      entityType,
      entityId: params.entityId,
      entityTitle: targetTitle,
      entityPath: targetPath,
      metadata: {
        relationId: params.relationId,
        targetType,
        targetId: params.targetId
      }
    })
  })

  ipcMain.handle('long-context:get-metrics', async (_event, params: {
    vaultPath: string
    since?: number
    until?: number
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:get-metrics.vaultPath')
    const since = ensureOptionalUnixSeconds(params?.since, 'long-context:get-metrics.since')
    const until = ensureOptionalUnixSeconds(params?.until, 'long-context:get-metrics.until')
    if (since !== undefined && until !== undefined && since > until) {
      throw new Error('Invalid IPC payload: long-context:get-metrics.since must be before until')
    }
    return getLongContextMetrics({
      vaultPath: params.vaultPath,
      since,
      until
    }) as LongContextMetrics
  })

  ipcMain.handle('long-context:get-prefs', async () => {
    return getLongContextPrefs() as LongContextUserPrefs
  })

  ipcMain.handle('long-context:set-prefs', async (_event, params: { prefs: Partial<LongContextUserPrefs> }) => {
    if (!params || typeof params.prefs !== 'object' || params.prefs === null) {
      throw new Error('Invalid IPC payload: long-context:set-prefs.prefs must be an object')
    }
    return setLongContextPrefs(params.prefs) as LongContextUserPrefs
  })

  ipcMain.handle('long-context:inspect-pack', async (_event, params: {
    vaultPath: string
    currentFilePath?: string | null
    tokenBudget?: number
    language?: AppLanguage
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:inspect-pack.vaultPath')
    const currentFilePath = ensureOptionalBoundedString(params?.currentFilePath ?? undefined, 'long-context:inspect-pack.currentFilePath', MAX_PATH_LENGTH)
    const tokenBudget = typeof params?.tokenBudget === 'number' && Number.isFinite(params.tokenBudget)
      ? Math.max(200, Math.min(Math.round(params.tokenBudget), 8000))
      : undefined
    const pack = buildLongContextPack({
      vaultPath: params.vaultPath,
      currentFilePath: currentFilePath ?? null,
      tokenBudget,
      language: resolveAppLanguage(params.language)
    })
    return {
      pack: {
        hot: pack.hot.map(toPackItemPayload),
        warm: pack.warm.map(toPackItemPayload),
        cold: pack.cold.map(toPackItemPayload),
        estimatedTokens: pack.estimatedTokens,
        tokenBudget: pack.tokenBudget,
        droppedItems: pack.droppedItems.map(toPackItemPayload)
      },
      currentFilePath: currentFilePath || undefined,
      generatedAt: Date.now()
    } as LongContextInspection
  })

  ipcMain.handle('long-context:lookup-citation', async (_event, params: {
    vaultPath: string
    sourceFilePath: string
    sourceTitle: string
  }) => {
    ensureNonEmptyString(params?.vaultPath, 'long-context:lookup-citation.vaultPath')
    ensureBoundedString(params?.sourceFilePath, 'long-context:lookup-citation.sourceFilePath', MAX_PATH_LENGTH)
    ensureBoundedString(params?.sourceTitle, 'long-context:lookup-citation.sourceTitle', MAX_TITLE_LENGTH)
    const db = getDatabase(params.vaultPath)
    const normalizedPath = params.sourceFilePath.replace(/\\/g, '/').replace(/^\/+/, '')
    const title = params.sourceTitle

    const relationRows = db.prepare(`
      SELECT id, source_type, source_id, source_title, source_path,
             target_type, target_id, target_title, target_path,
             relation_type, confidence, score, evidence_json, reason, last_seen_at
      FROM ai_relations
      WHERE status = 'active'
        AND (
          source_path = ? OR target_path = ?
          OR source_title = ? OR target_title = ?
        )
      ORDER BY score DESC, last_seen_at DESC
      LIMIT 20
    `).all(normalizedPath, normalizedPath, title, title) as Array<{
      id: string
      source_type: LongContextEntityType
      source_id: string
      source_title: string | null
      source_path: string | null
      target_type: LongContextEntityType
      target_id: string
      target_title: string | null
      target_path: string | null
      relation_type: LongContextRelationType
      confidence: number
      score: number
      evidence_json: string
      reason: string
      last_seen_at: number
    }>

    const relations: LongContextSuggestion[] = relationRows.map((row) => {
      const matchesSource = row.source_path === normalizedPath || row.source_title === title
      return {
        relationId: row.id,
        targetType: matchesSource ? row.target_type : row.source_type,
        targetId: matchesSource ? row.target_id : row.source_id,
        targetTitle: (matchesSource ? row.target_title : row.source_title) || 'Untitled',
        targetPath: (matchesSource ? row.target_path : row.source_path) || undefined,
        relationType: row.relation_type,
        confidence: row.confidence,
        score: row.score,
        reason: row.reason,
        evidence: safeParseStringArray(row.evidence_json),
        lastSeenAt: row.last_seen_at
      }
    })

    const themeRows = db.prepare(`
      SELECT DISTINCT t.id, t.title, t.summary, t.keywords_json as keywordsJson,
             t.strength, t.evidence_count as evidenceCount,
             t.first_seen_at as firstSeenAt, t.last_seen_at as lastSeenAt
      FROM long_term_themes t
      INNER JOIN theme_memberships m ON m.theme_id = t.id
      WHERE t.status = 'active'
        AND (m.entity_path = ? OR m.entity_title = ?)
      ORDER BY t.strength DESC, t.last_seen_at DESC
      LIMIT 10
    `).all(normalizedPath, title) as Array<{
      id: string
      title: string
      summary: string
      keywordsJson: string
      strength: number
      evidenceCount: number
      firstSeenAt: number
      lastSeenAt: number
    }>

    const themes: LongTermTheme[] = themeRows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      keywords: safeParseStringArray(row.keywordsJson),
      strength: row.strength,
      evidenceCount: row.evidenceCount,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      memberships: []
    }))

    return {
      found: relations.length > 0 || themes.length > 0,
      relations,
      themes
    }
  })

  ipcMain.handle('db:build-search-index', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const publishProgress = (status: SearchIndexStatus): void => {
      searchIndexJobs.set(params.vaultPath, status)
      if (window && !window.isDestroyed()) {
        window.webContents.send('search-index:progress', status)
      }
    }
    return buildSearchIndex({ vaultPath: params.vaultPath, publishProgress })
  })

  ipcMain.handle('db:chat-history-load', async (_event, params: { vaultPath: string; sessionId?: string }) => {
    const db = getDatabase(params.vaultPath)
    if (params.sessionId) {
      const rows = db.prepare(
        'SELECT id, role, content, sources, created_at as createdAt FROM conversations WHERE session_id = ? ORDER BY created_at ASC LIMIT 200'
      ).all(params.sessionId) as { id: number; role: string; content: string; sources: string | null; createdAt: number }[]
      return rows.map((r): ChatHistoryEntry => ({
        id: String(r.id),
        role: normalizeChatRole(r.role),
        content: r.content,
        sources: parseChatSources(r.sources)
      }))
    }
    const rows = db.prepare(
      'SELECT id, role, content, sources, created_at as createdAt FROM conversations WHERE session_id IS NULL ORDER BY created_at ASC LIMIT 200'
    ).all() as { id: number; role: string; content: string; sources: string | null; createdAt: number }[]
    return rows.map((r): ChatHistoryEntry => ({
      id: String(r.id),
      role: normalizeChatRole(r.role),
      content: r.content,
      sources: parseChatSources(r.sources)
    }))
  })

  ipcMain.handle('db:chat-history-append', async (_event, params: { vaultPath: string; role: ChatHistoryRole; content: string; sources?: ChatSource[]; sessionId?: string }) => {
    const db = getDatabase(params.vaultPath)
    const result = db.prepare(
      'INSERT INTO conversations (role, content, sources, session_id) VALUES (?, ?, ?, ?)'
    ).run(params.role, params.content, params.sources ? JSON.stringify(params.sources) : null, params.sessionId || null)
    if (params.sessionId) {
      db.prepare('UPDATE chat_sessions SET updated_at = unixepoch() WHERE id = ?').run(params.sessionId)
    }
    if (params.role === 'user') {
      scheduleLongContextAnalysis({
        vaultPath: params.vaultPath,
        entityType: 'chat',
        entityId: `chat-${String(result.lastInsertRowid)}`,
        content: params.content,
        eventType: 'ai_question_asked',
        trigger: 'db:chat-history-append'
      })
    }
  })

  ipcMain.handle('db:chat-history-clear', async (_event, params: { vaultPath: string; sessionId?: string }) => {
    const db = getDatabase(params.vaultPath)
    if (params.sessionId) {
      db.prepare('DELETE FROM conversations WHERE session_id = ?').run(params.sessionId)
    } else {
      db.prepare('DELETE FROM conversations WHERE session_id IS NULL').run()
    }
  })

  ipcMain.handle('db:chat-sessions-list', async (_event, params: { vaultPath: string }) => {
    const db = getDatabase(params.vaultPath)
    return db.prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM chat_sessions ORDER BY updated_at DESC').all()
  })

  ipcMain.handle('db:chat-session-create', async (_event, params: { vaultPath: string; id: string; title: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('INSERT INTO chat_sessions (id, title) VALUES (?, ?)').run(params.id, params.title)
  })

  ipcMain.handle('db:chat-session-delete', async (_event, params: { vaultPath: string; sessionId: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('DELETE FROM conversations WHERE session_id = ?').run(params.sessionId)
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(params.sessionId)
  })

  ipcMain.handle('db:chat-session-rename', async (_event, params: { vaultPath: string; sessionId: string; title: string }) => {
    const db = getDatabase(params.vaultPath)
    db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').run(params.title, params.sessionId)
  })
}

function getKanbanSnapshot(vaultPath: string): { columns: KanbanColumnRow[]; tasks: KanbanTaskRow[]; relations: KanbanRelationRow[] } {
  const db = getDatabase(vaultPath)
  const columns = db.prepare('SELECT id, name, sort_order as sortOrder FROM kanban_columns ORDER BY sort_order ASC').all() as KanbanColumnRow[]
  const tasks = db.prepare(`
    SELECT t.id, t.column_id as columnId, t.title, t.description, t.sort_order as sortOrder,
           t.priority, t.due_date as dueDate, t.source_note_id as sourceNoteId,
           t.source_file_path as sourceFilePath, n.title as sourceTitle,
           t.created_at as createdAt, t.updated_at as updatedAt
    FROM kanban_tasks t
    LEFT JOIN notes n ON n.id = t.source_note_id
    ORDER BY t.column_id ASC, t.sort_order ASC, t.created_at ASC
  `).all() as KanbanTaskRow[]
  const relations = db.prepare(`
    SELECT id, source_task_id as sourceTaskId, target_task_id as targetTaskId, relation_type as relationType
    FROM kanban_task_relations
  `).all() as KanbanRelationRow[]
  return { columns, tasks, relations }
}

async function buildSearchIndex(params: SearchIndexBuildParams): Promise<SearchIndexBuildResult> {
  const existingJob = searchIndexJobs.get(params.vaultPath)
  if (existingJob?.state === 'indexing') {
    return { indexed: existingJob.indexed }
  }

  const files = collectMarkdownFiles(params.vaultPath)
  const db = getDatabase(params.vaultPath)
  let indexed = 0
  const total = files.length

  params.publishProgress({
    state: 'indexing',
    current: 0,
    total,
    indexed,
    message: total === 0 ? '没有需要索引的笔记' : '准备建立本地检索索引',
    updatedAt: Date.now()
  })

  const startTime = Date.now()
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const content = readFileSync(file, 'utf-8')
      const relPath = file.replace(params.vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
      const note = db.prepare('SELECT id FROM notes WHERE file_path = ?').get(relPath) as { id: string } | undefined
      if (note) {
        const changed = await indexNoteSearchChunks(params.vaultPath, note.id, content)
        if (changed) indexed++
      }
      if (i % 3 === 0 || i === files.length - 1) {
        params.publishProgress({
          state: 'indexing',
          current: i + 1,
          total,
          indexed,
          message: `正在处理 ${i + 1}/${total}`,
          updatedAt: Date.now()
        })
        await new Promise((r) => setTimeout(r, 80))
      }
    }
    pushIndex(params.vaultPath).catch(() => {})
    invalidateSearchIndexCache()
    const elapsed = Date.now() - startTime
    const minDuration = 1500
    if (elapsed < minDuration) {
      await new Promise((r) => setTimeout(r, minDuration - elapsed))
    }
    const finalStatus = getSearchIndexStatus(params.vaultPath)
    params.publishProgress({
      ...finalStatus,
      state: 'done',
      current: finalStatus.indexed,
      message: indexed > 0 ? `已刷新 ${indexed} 篇笔记的本地检索索引` : '本地检索索引已是最新',
      updatedAt: Date.now()
    })
    return { indexed }
  } catch (e: unknown) {
    params.publishProgress({
      state: 'error',
      current: Math.min(total, searchIndexJobs.get(params.vaultPath)?.current || 0),
      total,
      indexed,
      message: getErrorMessage(e, '本地检索索引失败'),
      updatedAt: Date.now()
    })
    throw e
  }
}

function getSearchIndexStatus(vaultPath: string, previous?: SearchIndexJobStatus): SearchIndexStatus {
  const db = getDatabase(vaultPath)
  const totalRow = db.prepare('SELECT COUNT(*) as total FROM notes').get() as { total: number }
  const indexedRow = db.prepare(`
    SELECT COUNT(DISTINCT n.id) as indexed
    FROM notes n
    JOIN chunks c ON c.note_id = n.id
  `).get() as { indexed: number }
  const total = totalRow.total || 0
  const indexed = indexedRow.indexed || 0
  const state = total > 0 && indexed >= total ? 'done' : 'idle'
  return {
    state,
    current: previous?.state === 'done' ? previous.current : indexed,
    total,
    indexed,
    message: previous?.message,
    updatedAt: previous?.updatedAt || Date.now()
  }
}

function getFirstKanbanColumnId(db: Database.Database): string {
  const row = db.prepare('SELECT id FROM kanban_columns ORDER BY sort_order ASC LIMIT 1').get() as { id: string } | undefined
  if (row) return row.id
  db.prepare('INSERT INTO kanban_columns (id, name, sort_order) VALUES (?, ?, ?)').run('col-todo', '待办', 0)
  return 'col-todo'
}

async function runKanbanAi(system: string, user: string, signal?: AbortSignal): Promise<string> {
  if (!aiManager.getActiveConfig()) {
    throw new Error('未配置 AI 提供商')
  }

  let result = ''
  for await (const event of aiManager.chat([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ], signal)) {
    if (signal?.aborted) throw new Error('已取消')
    if (event.type === 'text') result += event.content
    if (event.type === 'error') throw new Error(event.content)
  }
  return result.trim()
}

function parseKanbanAiJson(raw: string): KanbanAiPlan {
  const parsed = extractJsonFromText(raw, 'object')
  return normalizeKanbanAiPlan(parsed)
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeKanbanAiTask(value: unknown): KanbanTaskInput {
  const task = isRecord(value) ? value : {}
  return {
    title: String(task.title || '').trim(),
    description: String(task.description || '').trim(),
    priority: Math.max(0, Math.min(3, Number(task.priority || 0))),
    dueDate: normalizeOptionalString(task.dueDate),
    sourceNoteId: normalizeOptionalString(task.sourceNoteId),
    sourceFilePath: normalizeOptionalString(task.sourceFilePath)
  }
}

function normalizeKanbanAiRelation(value: unknown): KanbanRelationInput {
  const relation = isRecord(value) ? value : {}
  const relationType = typeof relation.relationType === 'string' && RELATION_TYPES.has(relation.relationType as KanbanRelationType)
    ? relation.relationType as KanbanRelationType
    : 'related'
  return {
    sourceIndex: Number(relation.sourceIndex),
    targetIndex: Number(relation.targetIndex),
    relationType
  }
}

function normalizeKanbanAiPlan(parsed: unknown, maxTasks = 12): KanbanAiPlan {
  const source = isRecord(parsed) ? parsed : {}
  const tasks = Array.isArray(source.tasks) ? source.tasks : []
  const relations = Array.isArray(source.relations) ? source.relations : []

  return {
    tasks: tasks
      .map(normalizeKanbanAiTask)
      .filter((task) => task.title.length > 0)
      .slice(0, maxTasks),
    relations: relations
      .map(normalizeKanbanAiRelation)
      .filter((relation) => Number.isInteger(relation.sourceIndex) && Number.isInteger(relation.targetIndex))
  }
}

function cleanIndexedTaskTitle(text: string): string {
  return text
    .replace(/(?:^|\s|\[)(due|scheduled|start)::?\s*\d{4}-\d{2}-\d{2}(?:\]|$|\s|,|;)/gi, ' ')
    .replace(/(?:^|\s|\[)priority::?\s*(highest|high)(?:\]|$|\s|,|;)/gi, ' ')
    .replace(/(?:^|\s|\[)status::?\s*(blocked|waiting|wait)(?:\]|$|\s|,|;)/gi, ' ')
    .replace(/(?:^|\s|\[)(repeat|recur|recurrence)::?\s*([a-z0-9_-]+)(?:\]|$|\s|,|;)/gi, ' ')
    .replace(/(?:^|\s)\uD83D\uDCC5\s*\d{4}-\d{2}-\d{2}(?:$|\s)/g, ' ')
    .replace(/(?:^|\s)\u23F3\s*\d{4}-\d{2}-\d{2}(?:$|\s)/g, ' ')
    .replace(/(?:^|\s)\uD83D\uDEEB\s*\d{4}-\d{2}-\d{2}(?:$|\s)/g, ' ')
    .replace(/(?:^|\s)(\uD83D\uDD3A|\u23EB|\uD83D\uDD01)(?:$|\s)/g, ' ')
    .replace(/(?:^|\s)#(blocked|waiting)(?:$|\s|[.,;:!?])/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKanbanTaskKey(sourceFilePath: string | null | undefined, title: string): string {
  return `${sourceFilePath || ''}::${title.trim().toLowerCase()}`
}

function buildKanbanTaskFromIndexedTask(task: IndexedTaskRow, sourceNoteId: string | null): KanbanTaskInput {
  const dueDate = extractTaskDueDate(task.text)
  const scheduledDate = extractTaskScheduledDate(task.text)
  const startDate = extractTaskStartDate(task.text)
  const highPriority = extractHighTaskPriority(task.text)
  const blocked = extractBlockedTaskSignal(task.text)
  const recurring = extractRecurringTaskSignal(task.text)
  const signals = [
    dueDate ? `due ${dueDate}` : '',
    scheduledDate ? `scheduled ${scheduledDate}` : '',
    startDate ? `start ${startDate}` : '',
    highPriority ? `priority ${highPriority}` : '',
    blocked ? `blocked ${blocked}` : '',
    recurring ? `recurring ${recurring}` : ''
  ].filter(Boolean)

  return {
    title: cleanIndexedTaskTitle(task.text) || task.text,
    description: [
      `Source note: ${task.noteTitle}`,
      signals.length > 0 ? `Signals: ${signals.join(', ')}` : '',
      `Original task: ${task.text}`
    ].filter(Boolean).join('\n'),
    priority: highPriority === 'highest' ? 3 : highPriority === 'high' || blocked ? 2 : 1,
    dueDate,
    sourceNoteId,
    sourceFilePath: task.filePath
  }
}

function createKanbanTasks(db: Database.Database, columnId: string, tasks: KanbanTaskInput[]): KanbanTaskRow[] {
  const created: KanbanTaskRow[] = []
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM kanban_tasks WHERE column_id = ?').get(columnId) as { m: number | null }
  let nextOrder = (maxOrder.m ?? -1) + 1
  const stmt = db.prepare(`
    INSERT INTO kanban_tasks (id, column_id, title, description, sort_order, priority, due_date, source_note_id, source_file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const tx = db.transaction(() => {
    for (const task of tasks) {
      const id = randomUUID()
      const row = {
        id,
        columnId,
        title: task.title,
        description: task.description || '',
        sortOrder: nextOrder++,
        priority: task.priority || 0,
        dueDate: task.dueDate || null,
        sourceNoteId: task.sourceNoteId || null,
        sourceFilePath: task.sourceFilePath || null,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000)
      }
      stmt.run(row.id, row.columnId, row.title, row.description, row.sortOrder, row.priority, row.dueDate, row.sourceNoteId, row.sourceFilePath)
      created.push(row)
    }
  })
  tx()
  return created
}

function createIndexedRelations(db: Database.Database, tasks: KanbanTaskRow[], relations: KanbanRelationInput[]): KanbanRelationRow[] {
  const created: KanbanRelationRow[] = []
  const stmt = db.prepare('INSERT INTO kanban_task_relations (id, source_task_id, target_task_id, relation_type) VALUES (?, ?, ?, ?)')
  const tx = db.transaction(() => {
    for (const relation of relations) {
      const source = tasks[relation.sourceIndex]
      const target = tasks[relation.targetIndex]
      if (!source || !target || source.id === target.id) continue
      const row: KanbanRelationRow = {
        id: randomUUID(),
        sourceTaskId: source.id,
        targetTaskId: target.id,
        relationType: RELATION_TYPES.has(relation.relationType) ? relation.relationType : 'related'
      }
      stmt.run(row.id, row.sourceTaskId, row.targetTaskId, row.relationType)
      created.push(row)
    }
  })
  tx()
  return created
}

function toRelativePath(vaultPath: string, filePath: string): string {
  return filePath.replace(vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
}

function toPackItemPayload(item: LongContextPackItem): LongContextPackItemPayload {
  return {
    tier: item.tier,
    relationId: item.relationId,
    title: item.title,
    source: item.source,
    relationType: item.relationType as LongContextRelationType | undefined,
    confidence: item.confidence,
    score: item.score,
    reason: item.reason,
    evidence: item.evidence,
    droppedReason: item.droppedReason
  }
}

function safeParseStringArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}
