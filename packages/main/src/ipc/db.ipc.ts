import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { indexNote, removeNoteIndex, getAllNotes, getBacklinks, getUnlinkedMentions, getGraphData, getAllTags, getNotesByTag, getAllTasks } from '../services/indexer'
import { getDatabase, closeDatabase } from '../services/database'
import { semanticSearch, indexNoteEmbeddings, invalidateEmbeddingCache } from '../services/embedding'
import { pushIndex } from '../services/cloud/manager'
import { aiManager } from '../services/ai'
import { extractJsonFromText } from '../services/ai/json'
import { finishAiTask, startAiTask } from '../services/ai-task-control'
import type Database from 'better-sqlite3'
import type { ChatHistoryEntry, ChatHistoryRole, ChatSource, KanbanAiPlan, KanbanColumn } from '@shared/types/ipc'

type KanbanRelationType = KanbanAiPlan['relations'][number]['relationType']
type KanbanTaskInput = KanbanAiPlan['tasks'][number]
type KanbanRelationInput = KanbanAiPlan['relations'][number]
type KanbanColumnRow = KanbanColumn
type SqlValue = string | number | null

function getErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return fallback
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

type EmbeddingJobStatus = {
  state: 'idle' | 'indexing' | 'done' | 'error'
  current: number
  total: number
  embedded: number
  message?: string
  updatedAt: number
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

const RELATION_TYPES = new Set<KanbanRelationType>(['blocks', 'depends_on', 'related'])
const embeddingJobs = new Map<string, EmbeddingJobStatus>()

export function registerDbIPC(): void {
  ipcMain.handle('db:index-vault', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const files = collectMarkdownFiles(params.vaultPath)
    const db = getDatabase(params.vaultPath)

    // Clean up stale records for files that no longer exist
    const allNotes = db.prepare('SELECT id, file_path FROM notes').all() as { id: string; file_path: string }[]
    const existingRelPaths = new Set(files.map((f) => f.replace(params.vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')))
    const staleNotes = allNotes.filter((n) => !existingRelPaths.has(n.file_path))
    if (staleNotes.length > 0) {
      const deleteNote = db.prepare('DELETE FROM notes WHERE id = ?')
      const deleteFtsMap = db.prepare('DELETE FROM notes_fts_map WHERE note_id = ?')
      const deleteLinks = db.prepare('DELETE FROM links WHERE source_note_id = ? OR target_note_id = ?')
      for (const note of staleNotes) {
        const ftsRow = db.prepare('SELECT rowid FROM notes_fts_map WHERE note_id = ?').get(note.id) as { rowid: number } | undefined
        if (ftsRow) {
          db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(ftsRow.rowid)
          deleteFtsMap.run(note.id)
        }
        deleteLinks.run(note.id, note.id)
        deleteNote.run(note.id)
      }
    }

    const BATCH_SIZE = 20
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      for (const file of batch) {
        indexNote(params.vaultPath, file)
      }
      if (window && !window.isDestroyed()) {
        window.webContents.send('db:index-progress', { current: Math.min(i + BATCH_SIZE, files.length), total: files.length })
      }
      if (i + BATCH_SIZE < files.length) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
    invalidateEmbeddingCache()
    return { indexed: files.length }
  })

  ipcMain.handle('db:index-file', async (_event, params: { vaultPath: string; filePath: string }) => {
    indexNote(params.vaultPath, params.filePath)
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
    return getAllNotes(params.vaultPath)
  })

  ipcMain.handle('db:get-recent-notes', async (_event, params: { vaultPath: string; limit?: number }) => {
    const db = getDatabase(params.vaultPath)
    const limit = params.limit || 50
    return db.prepare(
      'SELECT id, title, file_path as filePath, created_at as createdAt, updated_at as updatedAt FROM notes ORDER BY updated_at DESC LIMIT ?'
    ).all(limit)
  })

  ipcMain.handle('db:get-backlinks', async (_event, params: { vaultPath: string; noteId: string }) => {
    return getBacklinks(params.vaultPath, params.noteId)
  })

  ipcMain.handle('db:get-unlinked-mentions', async (_event, params: { vaultPath: string; noteId: string }) => {
    return getUnlinkedMentions(params.vaultPath, params.noteId)
  })

  ipcMain.handle('db:get-graph', async (_event, params: { vaultPath: string }) => {
    return getGraphData(params.vaultPath)
  })

  ipcMain.handle('db:search-notes', async (_event, params: { vaultPath: string; query: string }) => {
    const db = getDatabase(params.vaultPath)
    const pattern = `%${params.query}%`
    return db.prepare(`
      SELECT id, title, file_path as filePath
      FROM notes
      WHERE title LIKE ?
      ORDER BY updated_at DESC
      LIMIT 20
    `).all(pattern)
  })

  ipcMain.handle('db:semantic-search', async (_event, params: { vaultPath: string; query: string }) => {
    return semanticSearch(params.vaultPath, params.query)
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
    return getAllTags(params.vaultPath)
  })

  ipcMain.handle('db:get-notes-by-tag', async (_event, params: { vaultPath: string; tag: string }) => {
    return getNotesByTag(params.vaultPath, params.tag)
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
    const db = getDatabase(params.vaultPath)
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM kanban_columns').get() as { m: number | null }
    db.prepare('INSERT INTO kanban_columns (id, name, sort_order) VALUES (?, ?, ?)').run(params.id, params.name, (maxOrder.m ?? -1) + 1)
  })

  ipcMain.handle('kanban:rename-column', async (_event, params: { vaultPath: string; id: string; name: string }) => {
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

  ipcMain.handle('kanban:create-task', async (_event, params: { vaultPath: string; id: string; columnId: string; title: string; description?: string; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }) => {
    const db = getDatabase(params.vaultPath)
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM kanban_tasks WHERE column_id = ?').get(params.columnId) as { m: number | null }
    db.prepare(`
      INSERT INTO kanban_tasks (id, column_id, title, description, sort_order, priority, due_date, source_note_id, source_file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(params.id, params.columnId, params.title.trim(), params.description || '', (maxOrder.m ?? -1) + 1, params.priority || 0, params.dueDate || null, params.sourceNoteId || null, params.sourceFilePath || null)
  })

  ipcMain.handle('kanban:update-task', async (_event, params: { vaultPath: string; id: string; title?: string; description?: string; columnId?: string; sortOrder?: number; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }) => {
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

  ipcMain.handle('db:embed-note', async (_event, params: { vaultPath: string; noteId: string; content: string }) => {
    await indexNoteEmbeddings(params.vaultPath, params.noteId, params.content)
  })

  ipcMain.handle('db:embedding-status', async (_event, params: { vaultPath: string }) => {
    const running = embeddingJobs.get(params.vaultPath)
    if (running?.state === 'indexing') return running
    return getEmbeddingStatus(params.vaultPath, running)
  })

  ipcMain.handle('db:embed-vault', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const existingJob = embeddingJobs.get(params.vaultPath)
    if (existingJob?.state === 'indexing') {
      return { embedded: existingJob.embedded }
    }

    const files = collectMarkdownFiles(params.vaultPath)
    const db = getDatabase(params.vaultPath)
    let embedded = 0
    const total = files.length
    const publishProgress = (status: EmbeddingJobStatus): void => {
      embeddingJobs.set(params.vaultPath, status)
      if (window && !window.isDestroyed()) {
        window.webContents.send('embed:progress', status)
      }
    }

    publishProgress({
      state: 'indexing',
      current: 0,
      total,
      embedded,
      message: total === 0 ? '没有需要索引的笔记' : '准备建立向量索引',
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
          const hasChunks = db.prepare('SELECT 1 FROM chunks WHERE note_id = ? LIMIT 1').get(note.id)
          if (!hasChunks) {
            await indexNoteEmbeddings(params.vaultPath, note.id, content)
            embedded++
          }
        }
        if (i % 3 === 0 || i === files.length - 1) {
          publishProgress({
            state: 'indexing',
            current: i + 1,
            total,
            embedded,
            message: `正在处理 ${i + 1}/${total}`,
            updatedAt: Date.now()
          })
          await new Promise((r) => setTimeout(r, 80))
        }
      }
      pushIndex(params.vaultPath).catch(() => {})
      invalidateEmbeddingCache()
      const elapsed = Date.now() - startTime
      const minDuration = 1500
      if (elapsed < minDuration) {
        await new Promise((r) => setTimeout(r, minDuration - elapsed))
      }
      const finalStatus = getEmbeddingStatus(params.vaultPath)
      publishProgress({
        ...finalStatus,
        state: 'done',
        current: finalStatus.embedded,
        message: embedded > 0 ? `已新增 ${embedded} 篇笔记的向量索引` : '向量索引已是最新',
        updatedAt: Date.now()
      })
      return { embedded }
    } catch (e: unknown) {
      publishProgress({
        state: 'error',
        current: Math.min(total, embeddingJobs.get(params.vaultPath)?.current || 0),
        total,
        embedded,
        message: getErrorMessage(e, '向量索引失败'),
        updatedAt: Date.now()
      })
      throw e
    }
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
    db.prepare(
      'INSERT INTO conversations (role, content, sources, session_id) VALUES (?, ?, ?, ?)'
    ).run(params.role, params.content, params.sources ? JSON.stringify(params.sources) : null, params.sessionId || null)
    if (params.sessionId) {
      db.prepare('UPDATE chat_sessions SET updated_at = unixepoch() WHERE id = ?').run(params.sessionId)
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

function getEmbeddingStatus(vaultPath: string, previous?: EmbeddingJobStatus): EmbeddingJobStatus {
  const db = getDatabase(vaultPath)
  const totalRow = db.prepare('SELECT COUNT(*) as total FROM notes').get() as { total: number }
  const embeddedRow = db.prepare(`
    SELECT COUNT(DISTINCT n.id) as embedded
    FROM notes n
    JOIN chunks c ON c.note_id = n.id
  `).get() as { embedded: number }
  const total = totalRow.total || 0
  const embedded = embeddedRow.embedded || 0
  const state = total > 0 && embedded >= total ? 'done' : 'idle'
  return {
    state,
    current: previous?.state === 'done' ? previous.current : embedded,
    total,
    embedded,
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

function normalizeKanbanAiPlan(parsed: unknown): KanbanAiPlan {
  const source = isRecord(parsed) ? parsed : {}
  const tasks = Array.isArray(source.tasks) ? source.tasks : []
  const relations = Array.isArray(source.relations) ? source.relations : []

  return {
    tasks: tasks
      .map(normalizeKanbanAiTask)
      .filter((task) => task.title.length > 0)
      .slice(0, 12),
    relations: relations
      .map(normalizeKanbanAiRelation)
      .filter((relation) => Number.isInteger(relation.sourceIndex) && Number.isInteger(relation.targetIndex))
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

function collectMarkdownFiles(dirPath: string): string[] {
  const results: string[] = []

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (extname(entry.name) === '.md') {
        results.push(fullPath)
      }
    }
  }

  walk(dirPath)
  return results
}
