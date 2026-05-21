import type { NoteIndex, OutgoingLinkIndex } from '../indexer'
import type { NoteMemory } from '../memory'

export interface ConnectionOpportunityPropertyRow {
  title: string
  filePath: string
  properties: Record<string, unknown>
}

export interface ConnectionOpportunityResult {
  sourceTitle: string
  sourcePath: string
  targetTitle: string
  targetPath: string
  score: number
  reasons: string[]
}

interface ConnectionOpportunityOptions {
  notes: NoteIndex[]
  propertyRows: ConnectionOpportunityPropertyRow[]
  outgoingLinksByNoteId: Map<string, OutgoingLinkIndex[]>
  memories?: NoteMemory[]
  query?: string
  limit?: number
}

interface Feature {
  key: string
  label: string
  weight: number
}

const IGNORED_PROPERTY_KEYS = new Set(['title', 'alias', 'aliases', 'tag', 'tags', 'cssclass', 'cssclasses'])
const MAX_FEATURE_GROUP_SIZE = 50

export function findConnectionOpportunities(options: ConnectionOpportunityOptions): ConnectionOpportunityResult[] {
  const limit = Math.max(1, Math.floor(options.limit || 5))
  const notesById = new Map(options.notes.map((note) => [note.id, note]))
  const noteIdsByPath = new Map(options.notes.map((note) => [note.filePath, note.id]))
  const featuresByNoteId = buildFeaturesByNoteId(options.notes, options.propertyRows, options.memories || [])
  const linkedPairKeys = buildLinkedPairKeys(options.notes, options.outgoingLinksByNoteId, noteIdsByPath)
  const featureGroups = new Map<string, { label: string; weight: number; noteIds: string[] }>()

  for (const [noteId, features] of featuresByNoteId) {
    for (const feature of features) {
      const group = featureGroups.get(feature.key) || { label: feature.label, weight: feature.weight, noteIds: [] }
      group.noteIds.push(noteId)
      featureGroups.set(feature.key, group)
    }
  }

  const pairScores = new Map<string, { sourceId: string; targetId: string; score: number; reasons: string[] }>()
  for (const group of featureGroups.values()) {
    const noteIds = Array.from(new Set(group.noteIds)).sort()
    if (noteIds.length < 2 || noteIds.length > MAX_FEATURE_GROUP_SIZE) continue

    for (let i = 0; i < noteIds.length; i++) {
      for (let j = i + 1; j < noteIds.length; j++) {
        const source = notesById.get(noteIds[i])
        const target = notesById.get(noteIds[j])
        if (!source || !target) continue
        const pairKey = getPairKey(source.filePath, target.filePath)
        if (linkedPairKeys.has(pairKey)) continue

        const current = pairScores.get(pairKey) || { sourceId: source.id, targetId: target.id, score: 0, reasons: [] }
        current.score += group.weight
        if (!current.reasons.includes(group.label) && current.reasons.length < 6) current.reasons.push(group.label)
        pairScores.set(pairKey, current)
      }
    }
  }

  const query = (options.query || '').trim().toLowerCase()
  return Array.from(pairScores.values())
    .map((pair) => {
      const source = notesById.get(pair.sourceId)
      const target = notesById.get(pair.targetId)
      if (!source || !target) return null
      return {
        sourceTitle: source.title,
        sourcePath: source.filePath,
        targetTitle: target.title,
        targetPath: target.filePath,
        score: pair.score,
        reasons: pair.reasons
      }
    })
    .filter((item): item is ConnectionOpportunityResult => item !== null)
    .filter((item) => item.score >= 2)
    .filter((item) => {
      if (!query) return true
      return [
        item.sourceTitle,
        item.sourcePath,
        item.targetTitle,
        item.targetPath,
        ...item.reasons
      ].some((value) => value.toLowerCase().includes(query))
    })
    .sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length || a.sourcePath.localeCompare(b.sourcePath) || a.targetPath.localeCompare(b.targetPath))
    .slice(0, limit)
}

function buildFeaturesByNoteId(
  notes: NoteIndex[],
  propertyRows: ConnectionOpportunityPropertyRow[],
  memories: NoteMemory[]
): Map<string, Feature[]> {
  const features = new Map<string, Feature[]>()
  const noteIdsByPath = new Map(notes.map((note) => [note.filePath, note.id]))

  for (const note of notes) {
    const folder = getFolder(note.filePath)
    if (folder) addFeature(features, note.id, `folder:${folder.toLowerCase()}`, `same folder: ${folder}`, 1)
  }

  for (const row of propertyRows) {
    const noteId = noteIdsByPath.get(row.filePath)
    if (!noteId) continue

    for (const tag of getTextValues(row.properties.tags)) {
      addFeature(features, noteId, `tag:${tag.toLowerCase()}`, `shared tag: #${tag}`, 3)
    }

    for (const [key, rawValue] of Object.entries(row.properties)) {
      const normalizedKey = key.trim().toLowerCase()
      if (IGNORED_PROPERTY_KEYS.has(normalizedKey)) continue
      for (const value of getTextValues(rawValue)) {
        if (value.length > 80) continue
        addFeature(features, noteId, `prop:${normalizedKey}:${value.toLowerCase()}`, `shared property: ${key}=${value}`, 2)
      }
    }
  }

  for (const memory of memories) {
    if (!features.has(memory.noteId)) continue
    for (const concept of uniqueText(memory.concepts)) {
      addFeature(features, memory.noteId, `concept:${concept.toLowerCase()}`, `shared concept: ${concept}`, 4)
    }
    for (const topic of uniqueText(memory.topics)) {
      addFeature(features, memory.noteId, `topic:${topic.toLowerCase()}`, `shared topic: ${topic}`, 2)
    }
  }

  return features
}

function buildLinkedPairKeys(
  notes: NoteIndex[],
  outgoingLinksByNoteId: Map<string, OutgoingLinkIndex[]>,
  noteIdsByPath: Map<string, string>
): Set<string> {
  const notesById = new Map(notes.map((note) => [note.id, note]))
  const linked = new Set<string>()
  for (const note of notes) {
    for (const link of outgoingLinksByNoteId.get(note.id) || []) {
      if (!link.resolved || !link.targetPath) continue
      const targetId = noteIdsByPath.get(link.targetPath)
      const target = targetId ? notesById.get(targetId) : null
      if (!target) continue
      linked.add(getPairKey(note.filePath, target.filePath))
    }
  }
  return linked
}

function addFeature(features: Map<string, Feature[]>, noteId: string, key: string, label: string, weight: number): void {
  const list = features.get(noteId) || []
  if (!list.some((item) => item.key === key)) list.push({ key, label, weight })
  features.set(noteId, list)
}

function getPairKey(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join('\u0000')
}

function getFolder(filePath: string): string {
  const index = filePath.lastIndexOf('/')
  return index > 0 ? filePath.slice(0, index) : ''
}

function getTextValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return uniqueText(values.map((item) => {
    if (item === null || item === undefined) return ''
    return String(item).replace(/^#/, '').trim()
  }))
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}
