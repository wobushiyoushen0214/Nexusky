import { getDatabase } from '../database'
import type { MemoryCard } from '@shared/types/ipc'

/** Normalise a stored timestamp to milliseconds.
 *  SQLite DDL uses unixepoch() (seconds) as default, while code uses Date.now() (ms).
 *  If the value looks like seconds (< 100000000000), convert to ms. */
function normalizeTs(ts: number): number {
  if (ts <= 0) return 0
  return ts < 100_000_000_000 ? ts * 1000 : ts
}

export function buildMemoryTimeline(vaultPath: string): MemoryCard[] {
  const db = getDatabase(vaultPath)

  const relations = db.prepare(`
    SELECT
      ar.id,
      ar.source_id as sourceNoteId,
      ar.target_id as targetNoteId,
      ar.relation_type as relationType,
      ar.confidence,
      ar.last_seen_at as lastSeenAt,
      ar.first_seen_at as firstSeenAt,
      COALESCE(n1.title, '') as sourceTitle,
      COALESCE(n1.file_path, '') as sourceFilePath,
      COALESCE(n2.title, '') as targetTitle,
      COALESCE(n2.file_path, '') as targetFilePath
    FROM ai_relations ar
    LEFT JOIN notes n1 ON ar.source_id = n1.id
    LEFT JOIN notes n2 ON ar.target_id = n2.id
    WHERE ar.confidence >= 0.3
      AND ar.last_seen_at > 0
      AND ar.first_seen_at > 0
    ORDER BY ar.last_seen_at DESC
    LIMIT 200
  `).all() as Array<{
    id: string
    sourceNoteId: string
    targetNoteId: string
    relationType: string
    confidence: number
    lastSeenAt: number
    firstSeenAt: number
    sourceTitle: string
    sourceFilePath: string
    targetTitle: string
    targetFilePath: string
  }>

  if (relations.length === 0) {
    return []
  }

  // Normalise timestamps: stored values might be seconds (unixepoch) or milliseconds (Date.now())
  for (const r of relations) {
    r.lastSeenAt = normalizeTs(r.lastSeenAt)
    r.firstSeenAt = normalizeTs(r.firstSeenAt)
  }

  const clusters = clusterRelationsByTopic(relations)
  const cards: MemoryCard[] = []

  for (const cluster of clusters) {
    const card = buildMemoryCardFromCluster(cluster)
    cards.push(card)
  }

  return cards.sort((a, b) => b.period.end - a.period.end)
}

interface RelationCluster {
  relations: Array<{
    sourceNoteId: string
    targetNoteId: string
    relationType: string
    confidence: number
    lastSeenAt: number
    firstSeenAt: number
    sourceTitle: string
    sourceFilePath: string
    targetTitle: string
    targetFilePath: string
  }>
  topic: string
  periodStart: number
  periodEnd: number
}

function clusterRelationsByTopic(relations: Array<any>): RelationCluster[] {
  const clusters = new Map<string, RelationCluster>()

  for (const rel of relations) {
    const topic = extractTopic(rel.relationType, rel.sourceTitle, rel.targetTitle)
    const periodKey = getMonthKey(rel.lastSeenAt)

    const clusterKey = `${topic}-${periodKey}`

    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, {
        relations: [],
        topic,
        periodStart: rel.firstSeenAt,
        periodEnd: rel.lastSeenAt
      })
    }

    const cluster = clusters.get(clusterKey)!
    cluster.relations.push(rel)
    cluster.periodStart = Math.min(cluster.periodStart, rel.firstSeenAt)
    cluster.periodEnd = Math.max(cluster.periodEnd, rel.lastSeenAt)
  }

  return Array.from(clusters.values())
    .filter(c => c.relations.length >= 2)
    .sort((a, b) => b.periodEnd - a.periodEnd)
    .slice(0, 50)
}

function extractTopic(relationType: string, sourceTitle: string | null, targetTitle: string | null): string {
  const keywords = new Set<string>()

  const words = [
    ...(sourceTitle || '').toLowerCase().split(/\s+/),
    ...(targetTitle || '').toLowerCase().split(/\s+/)
  ].filter(w => w.length > 0)

  for (const word of words) {
    if (word.length > 4 && !['about', 'notes', 'draft', 'review'].includes(word)) {
      keywords.add(word)
    }
  }

  if (keywords.size === 0) {
    return relationType.replace(/_/g, ' ')
  }

  return Array.from(keywords).slice(0, 2).join(' ')
}

function getMonthKey(timestamp: number): string {
  const date = new Date(timestamp) // timestamp 现在是毫秒
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function buildMemoryCardFromCluster(cluster: RelationCluster): MemoryCard {
  const noteIds = new Set<string>()
  const noteMap = new Map<string, { title: string; filePath: string; relevance: number }>()

  for (const rel of cluster.relations) {
    noteIds.add(rel.sourceNoteId)
    noteIds.add(rel.targetNoteId)

    if (!noteMap.has(rel.sourceNoteId) && rel.sourceTitle) {
      noteMap.set(rel.sourceNoteId, {
        title: rel.sourceTitle,
        filePath: rel.sourceFilePath || '',
        relevance: rel.confidence
      })
    }

    if (!noteMap.has(rel.targetNoteId) && rel.targetTitle) {
      noteMap.set(rel.targetNoteId, {
        title: rel.targetTitle,
        filePath: rel.targetFilePath || '',
        relevance: rel.confidence
      })
    }
  }

  const avgConfidence = cluster.relations.reduce((sum, r) => sum + r.confidence, 0) / cluster.relations.length
  const recency = Date.now() - cluster.periodEnd // 毫秒差值
  const tier = recency < 7 * 24 * 60 * 60 * 1000 ? 'Hot'
    : recency < 30 * 24 * 60 * 60 * 1000 ? 'Warm'
    : 'Cold'

  const title = generateMemoryTitle(cluster.topic, cluster.periodStart, cluster.periodEnd)
  const sources = Array.from(noteMap.entries()).map(([noteId, info]) => ({
    noteId,
    title: info.title,
    filePath: info.filePath,
    relevance: info.relevance
  }))

  const id = `mem-${cluster.topic.replace(/\s+/g, '-')}-${getMonthKey(cluster.periodEnd)}`

  return {
    id,
    title,
    period: {
      start: cluster.periodStart,
      end: cluster.periodEnd
    },
    sources: sources.slice(0, 10),
    tier,
    confidence: avgConfidence,
    userActions: {
      archived: false,
      pinned: false
    },
    createdAt: Date.now(), // 毫秒时间戳
    updatedAt: Date.now()  // 毫秒时间戳
  }
}

function generateMemoryTitle(topic: string, periodStart: number, periodEnd: number): string {
  const startDate = new Date(periodStart) // 直接使用毫秒时间戳
  const endDate = new Date(periodEnd)

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const startMonth = monthNames[startDate.getMonth()]
  const startYear = startDate.getFullYear()

  const formattedTopic = topic.charAt(0).toUpperCase() + topic.slice(1)

  return `You explored ${formattedTopic} in ${startMonth} ${startYear}`
}

export function updateMemoryCard(vaultPath: string, id: string, archived: boolean, pinned: boolean): void {
  const db = getDatabase(vaultPath)

  db.prepare(`
    INSERT INTO memory_cards (id, archived, pinned, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      archived = excluded.archived,
      pinned = excluded.pinned,
      updated_at = excluded.updated_at
  `).run(id, archived ? 1 : 0, pinned ? 1 : 0, Date.now()) // 使用毫秒时间戳
}

export function explainMemoryCard(vaultPath: string, id: string): string {
  const db = getDatabase(vaultPath)

  const card = db.prepare(`
    SELECT * FROM memory_cards WHERE id = ?
  `).get(id) as any

  if (!card) {
    return `This memory was derived from recent AI-inferred relationships in your vault.`
  }

  return `This memory represents connections between ${card.sources?.length || 0} notes that were frequently accessed together during this period. The system inferred these relationships based on your note-taking patterns and semantic similarity.`
}
