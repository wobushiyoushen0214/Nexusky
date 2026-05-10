export interface Note {
  id: string
  title: string
  filePath: string
  content: string
  frontmatter: Record<string, unknown>
  createdAt: number
  updatedAt: number
  tags: string[]
  outgoingLinks: Link[]
  incomingLinks: Link[]
}

export interface Link {
  id: number
  sourceNoteId: string
  targetNoteId: string | null
  targetTitle: string
  context?: string
}

export interface NoteMetadata {
  id: string
  title: string
  filePath: string
  createdAt: number
  updatedAt: number
  tags: string[]
}
