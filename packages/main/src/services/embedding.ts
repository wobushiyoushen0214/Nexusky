import { getDatabase } from './database'
import { aiManager } from './ai'
import OpenAI from 'openai'
import { store } from './store'
import type { AIProviderConfig } from './ai/base-provider'

const CHUNK_SIZE = 400
const CHUNK_OVERLAP = 50
const MAX_CACHE_CHUNKS = 2000

interface CachedChunk {
  noteId: string
  title: string
  filePath: string
  content: string
  embedding: Float32Array
  norm: number
}

let embeddingCache: { vaultPath: string; data: CachedChunk[] } | null = null

export function invalidateEmbeddingCache(): void {
  embeddingCache = null
}

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

  const BATCH_SIZE = 20
  const MAX_RETRIES = 3
  const allEmbeddings: number[][] = []

  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      let retries = 0
      while (retries < MAX_RETRIES) {
        try {
          const response = await client.embeddings.create({
            model: 'text-embedding-3-small',
            input: batch
          })
          allEmbeddings.push(...response.data.map((d) => d.embedding))
          break
        } catch (e: any) {
          retries++
          if (retries >= MAX_RETRIES) throw e
          const delay = Math.min(1000 * Math.pow(2, retries), 8000)
          await new Promise((r) => setTimeout(r, delay))
        }
      }
    }

    return allEmbeddings
  } catch {
    return null
  }
}

export async function indexNoteEmbeddings(vaultPath: string, noteId: string, content: string): Promise<void> {
  const db = getDatabase(vaultPath)
  const chunks = chunkText(content, noteId)

  const existingChunks = db.prepare(
    'SELECT id, chunk_index, content FROM chunks WHERE note_id = ?'
  ).all(noteId) as { id: string; chunk_index: number; content: string }[]

  const existingMap = new Map(existingChunks.map((c) => [c.chunk_index, c.content]))

  const changedChunks: TextChunk[] = []
  const unchangedIndexes = new Set<number>()

  for (const chunk of chunks) {
    const existing = existingMap.get(chunk.chunkIndex)
    if (existing === chunk.content) {
      unchangedIndexes.add(chunk.chunkIndex)
    } else {
      changedChunks.push(chunk)
    }
  }

  if (changedChunks.length === 0 && chunks.length === existingChunks.length) return

  const staleIds = existingChunks
    .filter((c) => !unchangedIndexes.has(c.chunk_index) && c.chunk_index >= chunks.length)
    .map((c) => c.id)

  if (staleIds.length > 0) {
    const placeholders = staleIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM chunks WHERE id IN (${placeholders})`).run(...staleIds)
  }

  if (changedChunks.length === 0) {
    invalidateEmbeddingCache()
    return
  }

  const embeddings = await generateEmbeddings(changedChunks.map((c) => c.content))
  if (!embeddings) return

  const upsert = db.prepare(`
    INSERT INTO chunks (id, note_id, chunk_index, content, heading_context, token_count, embedding, embedding_model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      heading_context = excluded.heading_context,
      token_count = excluded.token_count,
      embedding = excluded.embedding,
      embedding_model = excluded.embedding_model
  `)

  const transaction = db.transaction(() => {
    for (let i = 0; i < changedChunks.length; i++) {
      const chunk = changedChunks[i]
      const embedding = embeddings[i]
      const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer)
      upsert.run(
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
  invalidateEmbeddingCache()
}

export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function computeNorm(vec: Float32Array): number {
  let sum = 0
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i]
  return Math.sqrt(sum)
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

export async function semanticSearch(vaultPath: string, query: string, topK = 10): Promise<{ noteId: string; title: string; filePath: string; chunk: string; score: number }[]> {
  const db = getDatabase(vaultPath)
  const queryEmbedding = await generateEmbeddings([query])
  if (!queryEmbedding || queryEmbedding.length === 0) return []

  const qVec = new Float32Array(queryEmbedding[0])
  const qNorm = computeNorm(qVec)
  if (qNorm === 0) return []

  if (!embeddingCache || embeddingCache.vaultPath !== vaultPath) {
    const allChunks = db.prepare(`
      SELECT c.content, c.note_id, c.embedding, n.title, n.file_path
      FROM chunks c
      JOIN notes n ON n.id = c.note_id
      WHERE c.embedding IS NOT NULL
      ORDER BY n.updated_at DESC
      LIMIT ?
    `).all(MAX_CACHE_CHUNKS) as { content: string; note_id: string; embedding: Buffer; title: string; file_path: string }[]

    embeddingCache = {
      vaultPath,
      data: allChunks.map((row) => {
        const vec = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)
        return {
          noteId: row.note_id,
          title: row.title,
          filePath: row.file_path,
          content: row.content,
          embedding: vec,
          norm: computeNorm(vec)
        }
      })
    }
  }

  const results: { noteId: string; title: string; filePath: string; chunk: string; score: number }[] = []
  let minScore = -Infinity

  for (const row of embeddingCache.data) {
    if (row.norm === 0) continue
    const dot = dotProduct(qVec, row.embedding)
    const score = dot / (qNorm * row.norm)

    if (results.length < topK) {
      results.push({ noteId: row.noteId, title: row.title, filePath: row.filePath, chunk: row.content, score })
      if (results.length === topK) {
        results.sort((a, b) => a.score - b.score)
        minScore = results[0].score
      }
    } else if (score > minScore) {
      results[0] = { noteId: row.noteId, title: row.title, filePath: row.filePath, chunk: row.content, score }
      results.sort((a, b) => a.score - b.score)
      minScore = results[0].score
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results
}
