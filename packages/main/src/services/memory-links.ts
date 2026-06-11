import { invalidateVaultQueryCache } from './db-query-cache'
import { getDatabase } from './database'
import { resolveAllLinks } from './indexer'
import { findRelatedByMemory } from './memory'

export interface RefreshInferredLinksResult {
  added: number
  considered: number
  aborted: boolean
}

export function refreshInferredLinksFromMemory(
  vaultPath: string,
  options: { topK?: number; signal?: AbortSignal } = {}
): RefreshInferredLinksResult {
  const db = getDatabase(vaultPath)
  const topK = options.topK ?? 3
  const memoryPairs = findRelatedByMemory(vaultPath, topK)
  const insertLink = db.prepare('INSERT INTO links (source_note_id, target_title, context, link_type, created_at) VALUES (?, ?, ?, ?, ?)')
  const explicitLinkExists = db.prepare(`
    SELECT 1 FROM links
    WHERE source_note_id = ?
      AND link_type = 'explicit'
      AND (target_note_id = ? OR target_title = ?)
  `)
  const noteRows = db.prepare('SELECT id, title FROM notes').all() as { id: string; title: string }[]
  const noteTitleById = new Map(noteRows.map((note) => [note.id, note.title]))
  const inferredLinks: { sourceId: string; targetTitle: string; context: string }[] = []
  const pendingKeys = new Set<string>()

  for (const pair of memoryPairs) {
    if (options.signal?.aborted) return { added: 0, considered: memoryPairs.length, aborted: true }
    const sourceTitle = noteTitleById.get(pair.sourceId)
    const targetTitle = noteTitleById.get(pair.targetId)
    if (!sourceTitle || !targetTitle) continue
    if (explicitLinkExists.get(pair.sourceId, pair.targetId, targetTitle)) continue
    if (explicitLinkExists.get(pair.targetId, pair.sourceId, sourceTitle)) continue

    const key = `${pair.sourceId}\u0000${pair.targetId}`
    const reverseKey = `${pair.targetId}\u0000${pair.sourceId}`
    if (pendingKeys.has(key) || pendingKeys.has(reverseKey)) continue

    pendingKeys.add(key)
    inferredLinks.push({
      sourceId: pair.sourceId,
      targetTitle,
      context: pair.reason
    })
  }

  if (options.signal?.aborted) return { added: 0, considered: memoryPairs.length, aborted: true }

  const replaceInferredLinks = db.transaction(() => {
    const createdAt = Math.floor(Date.now() / 1000)
    db.prepare("DELETE FROM links WHERE link_type = 'inferred'").run()
    for (const link of inferredLinks) {
      insertLink.run(link.sourceId, link.targetTitle, link.context, 'inferred', createdAt)
    }
  })
  replaceInferredLinks()

  try { resolveAllLinks(vaultPath) } catch {}
  invalidateVaultQueryCache(vaultPath)
  return { added: inferredLinks.length, considered: memoryPairs.length, aborted: false }
}
