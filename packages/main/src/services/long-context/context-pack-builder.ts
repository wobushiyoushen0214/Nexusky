import { relative } from 'path'
import type Database from 'better-sqlite3'
import type { ChatSource } from '@shared/types/ipc'
import { getDatabase } from '../database'
import { getLongTermThemes } from './theme-extractor'
import { getContextSuggestions, type ContextSuggestion } from './relation-store'
import type { EntityType } from './relation-candidates'
import type { RelationType } from './relation-classifier'
import { getLongContextPrefs } from './long-context-prefs'

export type LongContextMemoryTier = 'hot' | 'warm' | 'cold'

export interface LongContextPackItem {
  tier: LongContextMemoryTier
  relationId?: string
  title: string
  source?: string
  relationType?: RelationType
  confidence?: number
  score?: number
  reason: string
  evidence: string[]
  droppedReason?: 'exceeded_token_budget'
}

export interface LongContextPack {
  tokenBudget: number
  estimatedTokens: number
  hot: LongContextPackItem[]
  warm: LongContextPackItem[]
  cold: LongContextPackItem[]
  droppedItems: LongContextPackItem[]
  systemText: string
  sources: ChatSource[]
}

interface BuildLongContextPackParams {
  vaultPath: string
  currentFilePath?: string | null
  tokenBudget?: number
  hotLimit?: number
  warmLimit?: number
  coldLimit?: number
}

interface NoteRef {
  id: string
  title: string
  filePath: string
}

interface RelationRow {
  id: string
  source_type: EntityType
  source_id: string
  source_title: string | null
  source_path: string | null
  target_type: EntityType
  target_id: string
  target_title: string | null
  target_path: string | null
  relation_type: RelationType
  confidence: number
  score: number
  evidence_json: string
  reason: string
  last_seen_at: number
}

export const LONG_CONTEXT_SYSTEM_GUARD = [
  '长期上下文是辅助，不可虚构用户事实。',
  'Treat every long-term relationship as recall evidence, not as a verified fact about the user.',
  'Low-confidence or weakly evidenced relationships are hypotheses; say so or ignore them if they are not useful.'
].join('\n')

export function buildLongContextPack(params: BuildLongContextPackParams): LongContextPack {
  const db = getDatabase(params.vaultPath)
  const prefs = getLongContextPrefs()
  const tokenBudget = Math.max(200, Math.min(params.tokenBudget ?? prefs.tokenBudget, 4000))
  const hotLimit = Math.max(1, Math.min(params.hotLimit ?? prefs.hotLimit, 10))
  const warmLimit = Math.max(1, Math.min(params.warmLimit ?? prefs.warmLimit, 10))
  const coldLimit = Math.max(1, Math.min(params.coldLimit ?? prefs.coldLimit, 10))
  const currentNote = resolveCurrentNote(db, params.vaultPath, params.currentFilePath)
  const sources: ChatSource[] = []

  const hotCandidates = currentNote
    ? getContextSuggestions({
      vaultPath: params.vaultPath,
      entityType: 'note',
      entityId: currentNote.id,
      limit: hotLimit
    }).map((suggestion) => suggestionToPackItem(suggestion))
    : []

  const warmCandidates = getLongTermThemes(params.vaultPath, warmLimit)
    .map((theme) => themeToPackItem(db, theme.id, theme.title, theme.summary, theme.keywords, theme.strength, theme.evidenceCount))

  const hotRelationIds = new Set(hotCandidates.map((item) => item.relationId).filter(Boolean))
  const coldCandidates = getColdRelations(db, currentNote, coldLimit)
    .filter((relation) => !hotRelationIds.has(relation.id))
    .map((relation) => relationRowToPackItem(relation, currentNote))

  const { picked, dropped } = pickWithinBudget([...hotCandidates, ...warmCandidates, ...coldCandidates], tokenBudget)
  for (const item of picked) addSource(sources, item)

  const pack: LongContextPack = {
    tokenBudget,
    estimatedTokens: estimateStringTokens(formatPackText(picked)),
    hot: picked.filter((item) => item.tier === 'hot'),
    warm: picked.filter((item) => item.tier === 'warm'),
    cold: picked.filter((item) => item.tier === 'cold'),
    droppedItems: dropped,
    systemText: '',
    sources
  }
  pack.systemText = formatPackText([...pack.hot, ...pack.warm, ...pack.cold])
  pack.estimatedTokens = estimateStringTokens(pack.systemText)
  return pack
}

export function mergeLongContextIntoSystemPrompt(systemPrompt: string, pack?: LongContextPack | null): string {
  if (!pack?.systemText.trim()) return systemPrompt
  const base = systemPrompt.trim()
  const longContext = `<long_term_context>\n${LONG_CONTEXT_SYSTEM_GUARD}\n\n${pack.systemText}\n</long_term_context>`
  return base ? `${base}\n\n${longContext}` : longContext
}

function resolveCurrentNote(db: Database.Database, vaultPath: string, currentFilePath?: string | null): NoteRef | null {
  if (!currentFilePath) return null
  const relPath = currentFilePath.startsWith(vaultPath)
    ? relative(vaultPath, currentFilePath)
    : currentFilePath
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const row = db.prepare('SELECT id, title, file_path as filePath FROM notes WHERE file_path = ?').get(normalized) as NoteRef | undefined
  return row || null
}

function suggestionToPackItem(suggestion: ContextSuggestion): LongContextPackItem {
  return {
    tier: 'hot',
    relationId: suggestion.relationId,
    title: suggestion.targetTitle,
    source: suggestion.targetPath || suggestion.targetId,
    relationType: suggestion.relationType,
    confidence: suggestion.confidence,
    score: suggestion.score,
    reason: suggestion.reason,
    evidence: suggestion.evidence.slice(0, 3)
  }
}

function themeToPackItem(
  db: Database.Database,
  themeId: string,
  title: string,
  summary: string,
  keywords: string[],
  strength: number,
  evidenceCount: number
): LongContextPackItem {
  const memberships = db.prepare(`
    SELECT entity_title as title, entity_path as path, confidence
    FROM theme_memberships
    WHERE theme_id = ?
    ORDER BY confidence DESC, updated_at DESC
    LIMIT 3
  `).all(themeId) as { title: string | null; path: string | null; confidence: number }[]
  const evidence = memberships.length > 0
    ? memberships.map((row) => `${row.title || row.path || 'Untitled'}${row.path ? ` (${row.path})` : ''}`)
    : [`${evidenceCount} evidence items`, `keywords: ${keywords.slice(0, 4).join(', ')}`]
  return {
    tier: 'warm',
    title,
    source: memberships.find((row) => row.path)?.path || undefined,
    confidence: strength,
    score: strength,
    reason: summary || `Recurring theme across ${evidenceCount} knowledge items.`,
    evidence
  }
}

function getColdRelations(db: Database.Database, currentNote: NoteRef | null, limit: number): RelationRow[] {
  if (currentNote) {
    return db.prepare(`
      SELECT *
      FROM ai_relations
      WHERE status = 'active'
        AND score >= 0.45
        AND (
          (source_type = 'note' AND source_id = ?)
          OR (target_type = 'note' AND target_id = ?)
        )
      ORDER BY last_seen_at ASC, score DESC
      LIMIT ?
    `).all(currentNote.id, currentNote.id, Math.max(1, Math.min(limit, 10))) as RelationRow[]
  }

  return db.prepare(`
    SELECT *
    FROM ai_relations
    WHERE status = 'active'
      AND score >= 0.6
    ORDER BY score DESC, last_seen_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(limit, 10))) as RelationRow[]
}

function relationRowToPackItem(row: RelationRow, currentNote: NoteRef | null): LongContextPackItem {
  const sourceMatches = currentNote && row.source_type === 'note' && row.source_id === currentNote.id
  const title = sourceMatches ? row.target_title : row.source_title
  const path = sourceMatches ? row.target_path : row.source_path
  return {
    tier: 'cold',
    relationId: row.id,
    title: title || path || row.id,
    source: path || row.id,
    relationType: row.relation_type,
    confidence: row.confidence,
    score: row.score,
    reason: row.reason,
    evidence: parseStringArray(row.evidence_json).slice(0, 3)
  }
}

function pickWithinBudget(items: LongContextPackItem[], tokenBudget: number): { picked: LongContextPackItem[]; dropped: LongContextPackItem[] } {
  const picked: LongContextPackItem[] = []
  const dropped: LongContextPackItem[] = []
  let used = 0
  for (const item of items) {
    const itemTokens = estimateStringTokens(formatPackItem(item))
    if (picked.length > 0 && used + itemTokens > tokenBudget) {
      dropped.push({ ...item, droppedReason: 'exceeded_token_budget' })
      continue
    }
    picked.push(item)
    used += itemTokens
  }
  return { picked, dropped }
}

function formatPackText(items: LongContextPackItem[]): string {
  if (items.length === 0) return ''
  const sections: { tier: LongContextMemoryTier; title: string }[] = [
    { tier: 'hot', title: 'Hot Memory' },
    { tier: 'warm', title: 'Warm Memory' },
    { tier: 'cold', title: 'Cold Memory' }
  ]
  return sections
    .map((section) => {
      const rows = items.filter((item) => item.tier === section.tier)
      if (rows.length === 0) return ''
      return `${section.title}\n${rows.map(formatPackItem).join('\n')}`
    })
    .filter(Boolean)
    .join('\n\n')
}

function formatPackItem(item: LongContextPackItem): string {
  const details = [
    item.source ? `source: ${item.source}` : '',
    item.relationType ? `relation: ${item.relationType}` : '',
    typeof item.confidence === 'number' ? `confidence: ${Math.round(item.confidence * 100)}%` : '',
    typeof item.score === 'number' ? `score: ${item.score.toFixed(2)}` : ''
  ].filter(Boolean).join('; ')
  const evidence = item.evidence.length > 0
    ? ` evidence: ${item.evidence.map((line) => `"${line}"`).join(' | ')}`
    : ''
  return `- ${item.title}${details ? ` (${details})` : ''}: ${item.reason}${evidence}`
}

function addSource(sources: ChatSource[], item: LongContextPackItem): void {
  if (!item.source || item.source.startsWith('theme-')) return
  const chunk = [item.reason, ...item.evidence].join(' ').slice(0, 160)
  if (sources.some((source) => source.filePath === item.source && source.title === item.title)) return
  sources.push({
    title: item.title,
    filePath: item.source,
    chunk,
    score: item.score ?? item.confidence ?? 0.5
  })
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item).trim()).filter(Boolean)
  } catch {
    return []
  }
}

function estimateStringTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x3000 && code <= 0x303F) || (code >= 0xFF00 && code <= 0xFFEF)) {
      cjk++
    } else {
      other++
    }
  }
  return cjk + Math.ceil(other / 4)
}
