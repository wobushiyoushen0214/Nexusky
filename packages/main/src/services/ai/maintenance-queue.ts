import type { OutgoingLinkIndex } from '../indexer'
import type { KnowledgeBridgeNoteResult } from './graph-insights'

export interface KnowledgeMaintenanceNote {
  id: string
  title: string
  filePath: string
  updatedAt: number
}

export interface KnowledgeMaintenanceItem {
  type: 'fix_unresolved_link' | 'connect_orphan' | 'link_unlinked_reference' | 'maintain_bridge'
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
