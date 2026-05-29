import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { aiManager } from './ai'
import { extractJsonFromText } from './ai/json'

export interface NoteMemory {
  noteId: string
  title: string
  folder: string
  contentHash: string
  concepts: string[]
  topics: string[]
  summary: string
  createdAt: number
  updatedAt: number
}

export const MEMORY_CONTENT_CHAR_BUDGET = 6000
const MEMORY_HEAD_CHARS = 2400
const MEMORY_MIDDLE_CHARS = 1800
const MEMORY_TAIL_CHARS = MEMORY_CONTENT_CHAR_BUDGET - MEMORY_HEAD_CHARS - MEMORY_MIDDLE_CHARS

export interface MemoryContentExcerpt {
  text: string
  truncated: boolean
}

export function buildMemoryContentExcerpt(content: string): MemoryContentExcerpt {
  if (content.length <= MEMORY_CONTENT_CHAR_BUDGET) {
    return { text: content, truncated: false }
  }

  const middleStart = Math.max(
    MEMORY_HEAD_CHARS,
    Math.floor((content.length - MEMORY_MIDDLE_CHARS) / 2)
  )
  const middleEnd = Math.min(
    content.length - MEMORY_TAIL_CHARS,
    middleStart + MEMORY_MIDDLE_CHARS
  )
  const tailStart = content.length - MEMORY_TAIL_CHARS

  return {
    truncated: true,
    text: [
      '[note excerpt: beginning]',
      content.slice(0, MEMORY_HEAD_CHARS).trimEnd(),
      '[note excerpt: middle]',
      content.slice(middleStart, middleEnd).trim(),
      '[note excerpt: end]',
      content.slice(tailStart).trimStart()
    ].join('\n')
  }
}

function getMemoriesDir(vaultPath: string): string {
  const dir = join(vaultPath, '.nexusky', 'memories')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getMemoryPath(vaultPath: string, noteId: string): string {
  return join(getMemoriesDir(vaultPath), `${noteId}.json`)
}

export function readMemory(vaultPath: string, noteId: string): NoteMemory | null {
  const path = getMemoryPath(vaultPath, noteId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function readAllMemories(vaultPath: string): NoteMemory[] {
  const dir = getMemoriesDir(vaultPath)
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
  const memories: NoteMemory[] = []
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'))
      memories.push(data)
    } catch {}
  }
  return memories
}

export function deleteMemory(vaultPath: string, noteId: string): void {
  const path = getMemoryPath(vaultPath, noteId)
  if (existsSync(path)) {
    try { unlinkSync(path) } catch {}
  }
}

export async function generateMemory(
  vaultPath: string,
  noteId: string,
  title: string,
  filePath: string,
  content: string,
  contentHash: string,
  signal?: AbortSignal
): Promise<NoteMemory | null> {
  const config = aiManager.getActiveConfig()
  if (!config || aiManager.validateConfig(config)) return null

  const provider = aiManager.getProvider(config)
  const folder = filePath.split('/').slice(0, -1).join('/') || '_root'
  const contentExcerpt = buildMemoryContentExcerpt(content)
  const contentLabel = contentExcerpt.truncated
    ? 'Note content excerpts (truncated; sampled from beginning, middle, and end):'
    : 'Note content:'

  let result = ''
  try {
    for await (const chunk of provider.chatStream([
      { role: 'system', content: `Analyze note content and extract structured memory. Output pure JSON only — no other text.

<format>
{"concepts": [...], "topics": [...], "summary": "..."}
</format>

<fields>
concepts (3-8): Core technical concepts or terms the note covers.
- Use the most widely recognized spelling: React (not react/ReactJS), TypeScript (not ts/TS), Node.js (not nodejs)
- Capitalize English concepts; use common abbreviations for Chinese concepts
- Moderate granularity: use "React Hooks" rather than too broad "React" or too narrow "useEffect"

topics (2-4): Knowledge domain tags the note belongs to.
- Use second-level category granularity: "Frontend Frameworks" not "Programming", "State Management" not "Software Engineering"

summary (50-150 chars): What this note covers, what problem it solves, and its core conclusion. Write in the same language as the note content.
</fields>` },
      { role: 'user', content: `Note title: ${title}\nNote path: ${filePath}\n\n${contentLabel}\n${contentExcerpt.text}` }
    ], signal)) {
      if (signal?.aborted) return null
      if (chunk.type === 'text') result += chunk.content
      if (chunk.type === 'error') break
    }
  } catch {
    return null
  }

  if (!result.trim()) return null

  try {
    const parsed = extractJsonFromText<{ concepts: string[]; topics: string[]; summary: string }>(result, 'object')

    const memory: NoteMemory = {
      noteId,
      title,
      folder,
      contentHash,
      concepts: parsed.concepts || [],
      topics: parsed.topics || [],
      summary: parsed.summary || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    writeFileSync(getMemoryPath(vaultPath, noteId), JSON.stringify(memory, null, 2), 'utf-8')
    return memory
  } catch {
    return null
  }
}

export function findRelatedByMemory(
  vaultPath: string,
  topK = 3
): { sourceId: string; sourceTitle: string; targetId: string; targetTitle: string; score: number; reason: string }[] {
  const memories = readAllMemories(vaultPath)
  if (memories.length < 2) return []

  const results: { sourceId: string; sourceTitle: string; targetId: string; targetTitle: string; score: number; reason: string }[] = []

  for (let i = 0; i < memories.length; i++) {
    const a = memories[i]
    const scored: { targetId: string; targetTitle: string; score: number; reason: string }[] = []

    for (let j = i + 1; j < memories.length; j++) {
      const b = memories[j]
      const bConceptsLower = b.concepts.map(c => c.toLowerCase())
      const bTopicsLower = b.topics.map(t => t.toLowerCase())
      const sharedConcepts = a.concepts.filter(c => bConceptsLower.includes(c.toLowerCase()))
      const sharedTopics = a.topics.filter(t => bTopicsLower.includes(t.toLowerCase()))

      if (sharedConcepts.length === 0 && sharedTopics.length === 0) continue

      const conceptScore = sharedConcepts.length / Math.max(a.concepts.length, b.concepts.length)
      const topicScore = sharedTopics.length / Math.max(a.topics.length, b.topics.length)
      const score = conceptScore * 0.7 + topicScore * 0.3

      if (score >= 0.3) {
        const reason = sharedConcepts.length > 0
          ? `共享概念: ${sharedConcepts.join(', ')}`
          : `共享主题: ${sharedTopics.join(', ')}`
        scored.push({ targetId: b.noteId, targetTitle: b.title, score, reason })
      }
    }

    scored.sort((x, y) => y.score - x.score)
    for (const s of scored.slice(0, topK)) {
      results.push({ sourceId: a.noteId, sourceTitle: a.title, ...s })
    }
  }

  return results
}
