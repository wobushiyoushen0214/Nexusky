import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { aiManager } from './ai'

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
  contentHash: string
): Promise<NoteMemory | null> {
  const config = aiManager.getActiveConfig()
  if (!config || aiManager.validateConfig(config)) return null

  const provider = aiManager.getProvider(config)
  const folder = filePath.split('/').slice(0, -1).join('/') || '_root'

  let result = ''
  try {
    for await (const chunk of provider.chatStream([
      { role: 'system', content: `你是一个知识分析助手。分析给定笔记的内容，提取核心信息生成结构化记忆。

输出严格的 JSON 格式：
{
  "concepts": ["概念1", "概念2", ...],
  "topics": ["主题1", "主题2", ...],
  "summary": "一段话概括笔记的核心内容和知识点（50-150字）"
}

规则：
1. concepts：提取 3-8 个核心概念/技术术语（如"React Hooks"、"依赖注入"、"响应式编程"）
2. topics：提取 2-4 个主题标签（如"前端开发"、"设计模式"、"性能优化"）
3. summary：概括笔记讲了什么、解决什么问题、核心观点是什么
4. 只输出 JSON，不要其他文字` },
      { role: 'user', content: `笔记标题：${title}\n笔记路径：${filePath}\n\n笔记内容：\n${content.slice(0, 3000)}` }
    ])) {
      if (chunk.type === 'text') result += chunk.content
      if (chunk.type === 'error') break
    }
  } catch {
    return null
  }

  if (!result.trim()) return null

  try {
    const jsonStr = result.replace(/```json?\s*|\s*```/g, '').trim()
    const parsed = JSON.parse(jsonStr) as { concepts: string[]; topics: string[]; summary: string }

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
      if (a.folder === b.folder) continue

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
