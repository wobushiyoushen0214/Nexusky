import type { NoteIndex, OutgoingLinkIndex } from '../indexer'

export interface KnowledgeBridgePropertyRow {
  filePath: string
  properties: Record<string, unknown>
}

export interface KnowledgeBridgeNoteResult {
  title: string
  filePath: string
  score: number
  connections: number
  folders: string[]
  tags: string[]
}

interface KnowledgeBridgeOptions {
  notes: NoteIndex[]
  outgoingLinksByNoteId: Map<string, OutgoingLinkIndex[]>
  propertyRows: KnowledgeBridgePropertyRow[]
  query?: string
  limit?: number
}

export function findKnowledgeBridgeNotes(options: KnowledgeBridgeOptions): KnowledgeBridgeNoteResult[] {
  const limit = Math.max(1, Math.floor(options.limit || 5))
  const notesById = new Map(options.notes.map((note) => [note.id, note]))
  const noteIdsByPath = new Map(options.notes.map((note) => [note.filePath, note.id]))
  const tagsByNoteId = buildTagsByNoteId(options.propertyRows, noteIdsByPath)
  const neighborsByNoteId = buildNeighborsByNoteId(options.notes, options.outgoingLinksByNoteId, noteIdsByPath)
  const query = (options.query || '').trim().toLowerCase()

  return options.notes
    .map((note) => {
      const neighborIds = Array.from(neighborsByNoteId.get(note.id) || [])
      if (neighborIds.length < 2) return null

      const folders = uniqueText(neighborIds.map((noteId) => getFolder(notesById.get(noteId)?.filePath || '')))
      const tags = uniqueText(neighborIds.flatMap((noteId) => tagsByNoteId.get(noteId) || []))
      if (!isBridgeCluster(folders, tags)) return null

      return {
        title: note.title,
        filePath: note.filePath,
        score: neighborIds.length + folders.length * 2 + tags.length,
        connections: neighborIds.length,
        folders,
        tags
      }
    })
    .filter((item): item is KnowledgeBridgeNoteResult => item !== null)
    .filter((item) => {
      if (!query) return true
      return [item.title, item.filePath, ...item.folders, ...item.tags].some((value) => value.toLowerCase().includes(query))
    })
    .sort((a, b) => b.score - a.score || b.connections - a.connections || a.filePath.localeCompare(b.filePath))
    .slice(0, limit)
}

function isBridgeCluster(folders: string[], tags: string[]): boolean {
  return (folders.length >= 2 && tags.length >= 2) || folders.length >= 3 || tags.length >= 3
}

function buildNeighborsByNoteId(
  notes: NoteIndex[],
  outgoingLinksByNoteId: Map<string, OutgoingLinkIndex[]>,
  noteIdsByPath: Map<string, string>
): Map<string, Set<string>> {
  const neighbors = new Map(notes.map((note) => [note.id, new Set<string>()]))

  for (const note of notes) {
    for (const link of outgoingLinksByNoteId.get(note.id) || []) {
      if (!link.resolved || !link.targetPath) continue
      const targetId = noteIdsByPath.get(link.targetPath)
      if (!targetId || targetId === note.id) continue
      neighbors.get(note.id)?.add(targetId)
      neighbors.get(targetId)?.add(note.id)
    }
  }

  return neighbors
}

function buildTagsByNoteId(propertyRows: KnowledgeBridgePropertyRow[], noteIdsByPath: Map<string, string>): Map<string, string[]> {
  const tagsByNoteId = new Map<string, string[]>()
  for (const row of propertyRows) {
    const noteId = noteIdsByPath.get(row.filePath)
    if (!noteId) continue
    tagsByNoteId.set(noteId, getTextValues(row.properties.tags).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean))
  }
  return tagsByNoteId
}

function getTextValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return uniqueText(values.map((item) => {
    if (item === null || item === undefined) return ''
    return String(item).trim()
  }))
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function getFolder(filePath: string): string {
  const index = filePath.lastIndexOf('/')
  return index > 0 ? filePath.slice(0, index) : '_root'
}
