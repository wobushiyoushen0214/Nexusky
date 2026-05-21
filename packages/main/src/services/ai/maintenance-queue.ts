import type { OutgoingLinkIndex } from '../indexer'
import type { KnowledgeBridgeNoteResult } from './graph-insights'

export interface KnowledgeMaintenanceNote {
  id: string
  title: string
  filePath: string
  updatedAt: number
}

export interface KnowledgeMaintenanceItem {
  type: 'fix_unresolved_link' | 'connect_orphan' | 'fill_empty_note' | 'resolve_duplicate_title' | 'resolve_duplicate_alias' | 'review_open_tasks' | 'link_unlinked_reference' | 'refresh_memory' | 'split_large_note' | 'fill_missing_property' | 'maintain_bridge'
  title: string
  filePath: string
  priority: number
  action: string
  reason: string
  detail: string
}

interface KnowledgeMaintenanceQueueOptions {
  notes: KnowledgeMaintenanceNote[]
  outgoingLinksByNoteId: Map<string, OutgoingLinkIndex[]>
  backlinkCountByNoteId: Map<string, number>
  unlinkedMentionCountByNoteId: Map<string, number>
  memoryStatusByNoteId?: Map<string, 'missing' | 'stale'>
  duplicateTitleCountByPath?: Map<string, number>
  duplicateAliasesByPath?: Map<string, string[]>
  emptyNotePaths?: Set<string>
  largeNoteCharactersByPath?: Map<string, number>
  missingPropertiesByPath?: Map<string, string[]>
  openTaskCountByPath?: Map<string, number>
  bridges: KnowledgeBridgeNoteResult[]
  query?: string
  limit?: number
}

export function buildKnowledgeMaintenanceQueue(options: KnowledgeMaintenanceQueueOptions): KnowledgeMaintenanceItem[] {
  const limit = Math.max(1, Math.floor(options.limit || 5))
  const items: KnowledgeMaintenanceItem[] = []
  const query = (options.query || '').trim().toLowerCase()
  const bridgeByPath = new Map(options.bridges.map((bridge) => [bridge.filePath, bridge]))

  for (const note of options.notes) {
    const outgoing = options.outgoingLinksByNoteId.get(note.id) || []
    const resolvedOutgoing = outgoing.filter((link) => link.resolved).length
    const backlinkCount = options.backlinkCountByNoteId.get(note.id) || 0
    const unlinkedMentionCount = options.unlinkedMentionCountByNoteId.get(note.id) || 0
    const memoryStatus = options.memoryStatusByNoteId?.get(note.id)
    const duplicateTitleCount = options.duplicateTitleCountByPath?.get(note.filePath) || 0
    const duplicateAliases = options.duplicateAliasesByPath?.get(note.filePath) || []
    const isEmpty = options.emptyNotePaths?.has(note.filePath) || false
    const largeCharacters = options.largeNoteCharactersByPath?.get(note.filePath) || 0
    const missingProperties = options.missingPropertiesByPath?.get(note.filePath) || []
    const openTaskCount = options.openTaskCountByPath?.get(note.filePath) || 0

    for (const link of outgoing) {
      if (link.resolved) continue
      items.push({
        type: 'fix_unresolved_link',
        title: note.title,
        filePath: note.filePath,
        priority: 100,
        action: `Resolve or create [[${link.targetTitle}]]`,
        reason: 'Broken wikilink blocks graph navigation and AI note lookup.',
        detail: link.context || link.targetTitle
      })
    }

    if (isEmpty) {
      items.push({
        type: 'fill_empty_note',
        title: note.title,
        filePath: note.filePath,
        priority: 78,
        action: 'Fill this empty note with a summary, source, or next action',
        reason: 'Empty notes add noise and usually indicate unfinished capture.',
        detail: `Updated: ${new Date(note.updatedAt).toISOString()}`
      })
    }

    if (duplicateTitleCount > 1) {
      items.push({
        type: 'resolve_duplicate_title',
        title: note.title,
        filePath: note.filePath,
        priority: 76,
        action: 'Rename or add a unique alias to disambiguate this note title',
        reason: 'Duplicate note titles make wikilink resolution and Agent note lookup ambiguous.',
        detail: `${duplicateTitleCount} notes share title: ${note.title}`
      })
    }

    if (duplicateAliases.length > 0) {
      items.push({
        type: 'resolve_duplicate_alias',
        title: note.title,
        filePath: note.filePath,
        priority: 72,
        action: `Make duplicate alias${duplicateAliases.length === 1 ? '' : 'es'} unique: ${duplicateAliases.join(', ')}`,
        reason: 'Duplicate aliases can route wikilinks and Agent reads to the wrong note.',
        detail: `Duplicate aliases: ${duplicateAliases.join(', ')}`
      })
    }

    if (resolvedOutgoing === 0 && backlinkCount === 0) {
      items.push({
        type: 'connect_orphan',
        title: note.title,
        filePath: note.filePath,
        priority: 80,
        action: 'Add at least one meaningful wikilink in or out of this note',
        reason: 'This note is isolated from the knowledge graph.',
        detail: `Updated: ${new Date(note.updatedAt).toISOString()}`
      })
    } else if (unlinkedMentionCount > 0) {
      items.push({
        type: 'link_unlinked_reference',
        title: note.title,
        filePath: note.filePath,
        priority: 60 + Math.min(unlinkedMentionCount, 10),
        action: `Convert ${unlinkedMentionCount} unlinked mention${unlinkedMentionCount === 1 ? '' : 's'} into wikilinks`,
        reason: 'Other notes mention this title without linking to it.',
        detail: `Unlinked mentions: ${unlinkedMentionCount}`
      })
    }

    if (openTaskCount > 0) {
      items.push({
        type: 'review_open_tasks',
        title: note.title,
        filePath: note.filePath,
        priority: 60 + Math.min(openTaskCount, 10),
        action: `Review ${openTaskCount} open task${openTaskCount === 1 ? '' : 's'} in this note`,
        reason: 'Open tasks embedded in notes should feed the next-action workflow.',
        detail: `Open tasks: ${openTaskCount}`
      })
    }

    if (memoryStatus) {
      items.push({
        type: 'refresh_memory',
        title: note.title,
        filePath: note.filePath,
        priority: memoryStatus === 'stale' ? 58 : 52,
        action: memoryStatus === 'stale' ? 'Regenerate this note memory from current content' : 'Generate AI memory for this note',
        reason: memoryStatus === 'stale' ? 'The note changed after its AI memory was generated.' : 'This note has no AI memory for semantic navigation.',
        detail: `Memory status: ${memoryStatus}`
      })
    }

    if (largeCharacters > 0) {
      items.push({
        type: 'split_large_note',
        title: note.title,
        filePath: note.filePath,
        priority: 56,
        action: 'Split this long note into focused linked notes or add a map-of-content section',
        reason: 'Very long notes are harder to navigate, summarize, and connect precisely.',
        detail: `${largeCharacters} characters`
      })
    }

    if (missingProperties.length > 0) {
      items.push({
        type: 'fill_missing_property',
        title: note.title,
        filePath: note.filePath,
        priority: 50,
        action: `Fill missing properties: ${missingProperties.join(', ')}`,
        reason: 'Consistent metadata makes Bases, filters, and Agent planning more reliable.',
        detail: `Missing properties: ${missingProperties.join(', ')}`
      })
    }

    const bridge = bridgeByPath.get(note.filePath)
    if (bridge) {
      items.push({
        type: 'maintain_bridge',
        title: note.title,
        filePath: note.filePath,
        priority: 40 + bridge.score,
        action: 'Review this synthesis note for summary, map-of-content links, or possible split',
        reason: 'This note connects multiple folders or tag clusters.',
        detail: `Folders: ${bridge.folders.join(', ')}; tags: ${bridge.tags.join(', ')}`
      })
    }
  }

  return items
    .filter((item) => {
      if (!query) return true
      return [item.title, item.filePath, item.action, item.reason, item.detail, item.type].some((value) => value.toLowerCase().includes(query))
    })
    .sort((a, b) => b.priority - a.priority || a.filePath.localeCompare(b.filePath) || a.action.localeCompare(b.action))
    .slice(0, limit)
}
