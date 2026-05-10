import { getDatabase } from './database'
import { aiManager } from './ai'
import OpenAI from 'openai'
import { store } from './store'
import type { AIProviderConfig } from './ai/base-provider'

const CHUNK_SIZE = 400
const CHUNK_OVERLAP = 50

export interface TextChunk {
  noteId: string
  chunkIndex: number
  content: string
  headingContext: string
  tokenCount: number
}

export function chunkText(content: string, noteId: string): TextChunk[] {
  const chunks: TextChunk[] = []
  const lines = content.split('\n')
  let currentChunk = ''
  let currentHeading = ''
  let chunkIndex = 0

  for (const line of lines) {
    if (line.startsWith('#')) {
      currentHeading = line.replace(/^#+\s*/, '')
    }

    currentChunk += line + '\n'

    if (currentChunk.length >= CHUNK_SIZE) {
      chunks.push({
        noteId,
        chunkIndex: chunkIndex++,
        content: currentChunk.trim(),
        headingContext: currentHeading,
        tokenCount: Math.ceil(currentChunk.length / 4)
      })
      const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP * 4)
      currentChunk = currentChunk.slice(overlapStart)
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      noteId,
      chunkIndex: chunkIndex++,
      content: currentChunk.trim(),
      headingContext: currentHeading,
      tokenCount: Math.ceil(currentChunk.length / 4)
    })
  }

  return chunks
}

export async function generateEmbeddings(texts: string[]): Promise<number[][] | null> {
  const configs = store.get('aiProviders') as AIProviderConfig[] | undefined
  if (!configs || configs.length === 0) return null

  const config = configs.find((c) => c.enabled && (c.type === 'openai' || c.type === 'custom'))
  if (!config) return null

  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })

    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts
    })

    return response.data.map((d) => d.embedding)
  } catch {
    return null
  }
}

export async function indexNoteEmbeddings(vaultPath: string, noteId: string, content: string): Promise<void> {
  const db = getDatabase(vaultPath)
  const chunks = chunkText(content, noteId)

  db.prepare('DELETE FROM chunks WHERE note_id = ?').run(noteId)

  const embeddings = await generateEmbeddings(chunks.map((c) => c.content))
  if (!embeddings) return

  const insert = db.prepare(`
    INSERT INTO chunks (id, note_id, chunk_index, content, heading_context, token_count, embedding, embedding_model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = embeddings[i]
      const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer)
      insert.run(
        `${noteId}_${chunk.chunkIndex}`,
        noteId,
        chunk.chunkIndex,
        chunk.content,
        chunk.headingContext,
        chunk.tokenCount,
        embeddingBlob,
        'text-embedding-3-small'
      )
    }
  })

  transaction()
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function semanticSearch(vaultPath: string, query: string, topK = 10): Promise<{ noteId: string; title: string; filePath: string; chunk: string; score: number }[]> {
  const db = getDatabase(vaultPath)
  const queryEmbedding = await generateEmbeddings([query])
  if (!queryEmbedding || queryEmbedding.length === 0) return []

  const qVec = queryEmbedding[0]
  const allChunks = db.prepare(`
    SELECT c.content, c.note_id, c.embedding, n.title, n.file_path
    FROM chunks c
    JOIN notes n ON n.id = c.note_id
    WHERE c.embedding IS NOT NULL
  `).all() as { content: string; note_id: string; embedding: Buffer; title: string; file_path: string }[]

  const scored = allChunks.map((row) => {
    const embedding = Array.from(new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4))
    const score = cosineSimilarity(qVec, embedding)
    return { noteId: row.note_id, title: row.title, filePath: row.file_path, chunk: row.content, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}
