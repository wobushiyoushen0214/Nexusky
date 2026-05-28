import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { getDatabase } from './database'

export interface VaultHealthSummary {
  noteCount: number
  linkCount: number
  unresolvedLinkCount: number
  orphanCount: number
  openTaskCount: number
  duplicateTitleCount: number
  missingMemoryCount: number
  staleNoteCount: number
}

const STALE_AGE_SECONDS = 60 * 24 * 60 * 60

/**
 * Cheap, single-pass vault-level snapshot. All counts come from SQL aggregates
 * so the call stays well under 100 ms even for ~10k notes.
 *
 * The result is intended for a one-shot "vault health" panel; expensive
 * per-note analysis (theme extraction, embeddings, etc.) belongs in the
 * existing maintenance queue, not here.
 */
export function scanVaultHealth(vaultPath: string, nowSeconds: number = Math.floor(Date.now() / 1000)): VaultHealthSummary {
  const db = getDatabase(vaultPath)

  const noteRow = db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }
  const linkRow = db.prepare('SELECT COUNT(*) AS c FROM links').get() as { c: number }
  const unresolvedRow = db
    .prepare('SELECT COUNT(*) AS c FROM links WHERE target_note_id IS NULL')
    .get() as { c: number }
  const openTaskRow = db
    .prepare('SELECT COUNT(*) AS c FROM tasks WHERE done = 0')
    .get() as { c: number }

  const orphanRow = db
    .prepare(`
      SELECT COUNT(*) AS c FROM notes
      WHERE id NOT IN (SELECT source_note_id FROM links WHERE target_note_id IS NOT NULL)
        AND id NOT IN (SELECT target_note_id FROM links WHERE target_note_id IS NOT NULL)
    `)
    .get() as { c: number }

  const duplicateRow = db
    .prepare(`
      SELECT COUNT(*) AS c FROM (
        SELECT title FROM notes GROUP BY title HAVING COUNT(*) > 1
      )
    `)
    .get() as { c: number }

  const staleCutoff = nowSeconds - STALE_AGE_SECONDS
  const staleRow = db
    .prepare('SELECT COUNT(*) AS c FROM notes WHERE updated_at < ?')
    .get(staleCutoff) as { c: number }

  const missingMemoryCount = countMissingMemories(vaultPath, db, noteRow.c)

  return {
    noteCount: noteRow.c,
    linkCount: linkRow.c,
    unresolvedLinkCount: unresolvedRow.c,
    orphanCount: orphanRow.c,
    openTaskCount: openTaskRow.c,
    duplicateTitleCount: duplicateRow.c,
    missingMemoryCount,
    staleNoteCount: staleRow.c
  }
}

interface DbHandle {
  prepare(sql: string): { all(...args: unknown[]): unknown[] }
}

function countMissingMemories(vaultPath: string, db: DbHandle, totalNotes: number): number {
  if (totalNotes === 0) return 0
  const memoriesDir = join(vaultPath, '.nexusky', 'memories')
  if (!existsSync(memoriesDir)) return totalNotes
  let memoryIds: Set<string>
  try {
    memoryIds = new Set(
      readdirSync(memoriesDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
    )
  } catch {
    return totalNotes
  }
  if (memoryIds.size === 0) return totalNotes

  const rows = db.prepare('SELECT id FROM notes').all() as { id: string }[]
  let missing = 0
  for (const row of rows) {
    if (!memoryIds.has(row.id)) missing += 1
  }
  return missing
}

