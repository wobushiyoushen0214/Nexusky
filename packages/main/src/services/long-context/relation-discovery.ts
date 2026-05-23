import type Database from 'better-sqlite3'
import { getDatabase } from '../database'
import { findRelationCandidates, type EntityType } from './relation-candidates'
import { classifyRelation, shouldPersistRelationClassification, type RelationClassifierProvider } from './relation-classifier'
import { getContextSuggestions, upsertRelation, type ContextSuggestion } from './relation-store'
import { getLongContextPrefs } from './long-context-prefs'

export interface LongContextEntitySnapshot {
  title: string
  path?: string
  content: string
}

export interface DiscoverLongContextRelationsParams {
  vaultPath: string
  entityType: EntityType
  entityId: string
  content?: string
  limit?: number
  provider?: RelationClassifierProvider
  signal?: AbortSignal
}

export interface DiscoverLongContextRelationsResult {
  discovered: number
  suggestions: ContextSuggestion[]
}

export async function discoverLongContextRelations(
  params: DiscoverLongContextRelationsParams
): Promise<DiscoverLongContextRelationsResult> {
  const db = getDatabase(params.vaultPath)
  const limit = Math.max(1, Math.min(params.limit ?? 10, 20))
  const current = getLongContextEntitySnapshot(db, params.entityType, params.entityId, params.content)
  if (!current) {
    return { discovered: 0, suggestions: [] }
  }

  const candidates = findRelationCandidates({
    vaultPath: params.vaultPath,
    entityType: params.entityType,
    entityId: params.entityId,
    content: params.content,
    limit
  })

  const prefs = getLongContextPrefs()

  let discovered = 0
  for (const candidate of candidates) {
    if (params.signal?.aborted) break
    const target = getLongContextEntitySnapshot(db, candidate.targetType, candidate.targetId)
    if (!target) continue
    const classification = await classifyRelation({
      current: {
        title: current.title,
        content: current.content
      },
      candidate: {
        title: target.title,
        content: target.content
      },
      signals: candidate.signals
    }, {
      provider: params.provider,
      signal: params.signal
    })
    if (!shouldPersistRelationClassification(classification, prefs.confidenceThreshold)) continue

    upsertRelation(params.vaultPath, {
      sourceType: params.entityType,
      sourceId: params.entityId,
      sourceTitle: current.title,
      sourcePath: current.path,
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      targetTitle: candidate.targetTitle || target.title,
      targetPath: candidate.targetPath || target.path,
      relationType: classification.relationType,
      confidence: classification.confidence,
      localScore: candidate.localScore,
      evidence: classification.evidence,
      reason: classification.reason
    })
    discovered += 1
  }

  return {
    discovered,
    suggestions: getContextSuggestions({
      vaultPath: params.vaultPath,
      entityType: params.entityType,
      entityId: params.entityId,
      limit: Math.min(limit, 3)
    })
  }
}

export function getLongContextEntitySnapshot(
  db: Database.Database,
  entityType: EntityType,
  entityId: string,
  contentOverride?: string
): LongContextEntitySnapshot | null {
  if (entityType === 'note') {
    const row = db.prepare(`
      SELECT n.title, n.file_path as filePath, COALESCE(f.content, '') as content
      FROM notes n
      LEFT JOIN notes_fts_map m ON m.note_id = n.id
      LEFT JOIN notes_fts f ON f.rowid = m.rowid
      WHERE n.id = ?
    `).get(entityId) as { title: string; filePath: string; content: string } | undefined
    if (!row) return null
    return {
      title: row.title,
      path: row.filePath,
      content: contentOverride?.trim() || row.content || ''
    }
  }

  if (entityType === 'task') {
    const kanbanTask = db.prepare(`
      SELECT title, description, source_file_path as filePath
      FROM kanban_tasks
      WHERE id = ?
    `).get(entityId) as { title: string; description: string | null; filePath: string | null } | undefined
    if (kanbanTask) {
      return {
        title: kanbanTask.title,
        path: kanbanTask.filePath || undefined,
        content: contentOverride?.trim() || kanbanTask.description || kanbanTask.title
      }
    }

    const inlineTask = db.prepare(`
      SELECT t.text, n.title as noteTitle, n.file_path as filePath
      FROM tasks t
      JOIN notes n ON n.id = t.note_id
      WHERE CAST(t.id AS TEXT) = ?
    `).get(entityId) as { text: string; noteTitle: string; filePath: string } | undefined
    if (!inlineTask) return null
    return {
      title: inlineTask.text,
      path: inlineTask.filePath,
      content: contentOverride?.trim() || `${inlineTask.noteTitle}\n${inlineTask.text}`
    }
  }

  return {
    title: 'Chat context',
    content: contentOverride?.trim() || ''
  }
}
