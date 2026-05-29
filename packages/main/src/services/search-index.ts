import { getDatabase } from './database'
import { aiManager } from './ai'

const CHUNK_SIZE = 400
const CHUNK_OVERLAP = 50
const MAX_CACHE_CHUNKS = 2000

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

// --- TF-IDF implementation ---

const STOP_WORDS = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'if', 'that', 'this', 'it', 'its'])

const DICT_WORDS = new Set([
  '机器学习', '深度学习', '神经网络', '自然语言', '人工智能', '数据结构', '算法',
  '操作系统', '计算机', '数据库', '编程语言', '面向对象', '函数式', '设计模式',
  '微服务', '分布式', '云计算', '容器化', '虚拟化', '负载均衡', '消息队列',
  '前端', '后端', '全栈', '响应式', '组件化', '状态管理', '路由', '渲染',
  '性能优化', '内存管理', '垃圾回收', '并发编程', '异步编程', '多线程',
  '版本控制', '持续集成', '持续部署', '自动化测试', '单元测试', '集成测试',
  '网络协议', '加密算法', '身份认证', '权限控制', '安全漏洞',
  '项目管理', '敏捷开发', '需求分析', '系统设计', '架构设计',
  '知识图谱', '搜索引擎', '推荐系统', '数据分析', '数据挖掘',
  '依赖注入', '控制反转', '生命周期', '事件驱动', '观察者',
])

function tokenize(text: string): string[] {
  const result: string[] = []
  const lower = text.toLowerCase()
  const segments = lower.replace(/[^\w一-鿿぀-ゟ゠-ヿ-]/g, ' ').split(/\s+/)

  for (const seg of segments) {
    if (!seg) continue
    if (/^[a-z0-9_-]+$/.test(seg)) {
      if (seg.length > 1 && !STOP_WORDS.has(seg)) result.push(seg)
    } else {
      const chars = [...seg].filter((c) => /[一-鿿぀-ゟ゠-ヿ]/.test(c))
      if (chars.length === 0) continue
      const str = chars.join('')

      let i = 0
      while (i < chars.length) {
        let matched = false
        for (let len = Math.min(4, chars.length - i); len >= 2; len--) {
          const word = str.slice(i, i + len)
          if (DICT_WORDS.has(word)) {
            result.push(word)
            i += len
            matched = true
            break
          }
        }
        if (!matched) {
          if (i < chars.length - 1) {
            const bigram = chars[i] + chars[i + 1]
            if (!STOP_WORDS.has(bigram)) result.push(bigram)
          }
          i++
        }
      }

      if (str.length >= 2 && str.length <= 6 && !DICT_WORDS.has(str)) {
        result.push(str)
      }
    }
  }
  return result
}

interface TfIdfDoc {
  noteId: string
  title: string
  filePath: string
  content: string
  headingContext: string
  terms: Map<string, number>
  norm: number
}

let tfidfCache: { vaultPath: string; docs: TfIdfDoc[]; idf: Map<string, number> } | null = null

export function invalidateSearchIndexCache(): void {
  tfidfCache = null
}

export function invalidateNoteInCache(vaultPath: string, noteId: string): void {
  if (!tfidfCache || tfidfCache.vaultPath !== vaultPath) return
  const idx = tfidfCache.docs.findIndex((d) => d.noteId === noteId)
  if (idx === -1) return

  const db = getDatabase(vaultPath)
  const rows = db.prepare(`
    SELECT c.content, c.heading_context, c.note_id, n.title, n.file_path
    FROM chunks c JOIN notes n ON n.id = c.note_id
    WHERE c.note_id = ?
  `).all(noteId) as { content: string; heading_context: string; note_id: string; title: string; file_path: string }[]

  // Remove old docs for this note
  tfidfCache.docs = tfidfCache.docs.filter((d) => d.noteId !== noteId)

  if (rows.length === 0) {
    rebuildIdf()
    return
  }

  // Add updated docs
  for (const row of rows) {
    const tokens = tokenize(row.content + ' ' + row.title + ' ' + (row.heading_context || ''))
    const tf = new Map<string, number>()
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1)
    tfidfCache.docs.push({
      noteId: row.note_id,
      title: row.title,
      filePath: row.file_path,
      content: row.content,
      headingContext: row.heading_context || '',
      terms: tf,
      norm: 0
    })
  }

  rebuildIdf()
}

function rebuildIdf(): void {
  if (!tfidfCache) return
  const N = tfidfCache.docs.length
  const df = new Map<string, number>()
  for (const doc of tfidfCache.docs) {
    const seen = new Set<string>()
    for (const term of doc.terms.keys()) {
      if (!seen.has(term)) { df.set(term, (df.get(term) || 0) + 1); seen.add(term) }
    }
  }
  const idf = new Map<string, number>()
  for (const [term, count] of df) idf.set(term, Math.log((N + 1) / (count + 1)) + 1)
  tfidfCache.idf = idf
  for (const doc of tfidfCache.docs) {
    let sumSq = 0
    for (const [term, freq] of doc.terms) { const w = freq * (idf.get(term) || 1); sumSq += w * w }
    doc.norm = Math.sqrt(sumSq)
  }
}

function buildTfIdfIndex(vaultPath: string): { docs: TfIdfDoc[]; idf: Map<string, number> } {
  if (tfidfCache && tfidfCache.vaultPath === vaultPath) return tfidfCache

  const db = getDatabase(vaultPath)
  const rows = db.prepare(`
    SELECT c.content, c.heading_context, c.note_id, n.title, n.file_path
    FROM chunks c
    JOIN notes n ON n.id = c.note_id
    ORDER BY n.updated_at DESC
    LIMIT ?
  `).all(MAX_CACHE_CHUNKS) as { content: string; heading_context: string; note_id: string; title: string; file_path: string }[]

  const df = new Map<string, number>()
  const docs: TfIdfDoc[] = []

  for (const row of rows) {
    const tokens = tokenize(row.content + ' ' + row.title + ' ' + (row.heading_context || ''))
    const tf = new Map<string, number>()
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1)
    }
    const seen = new Set<string>()
    for (const token of tokens) {
      if (!seen.has(token)) {
        df.set(token, (df.get(token) || 0) + 1)
        seen.add(token)
      }
    }
    docs.push({
      noteId: row.note_id,
      title: row.title,
      filePath: row.file_path,
      content: row.content,
      headingContext: row.heading_context || '',
      terms: tf,
      norm: 0
    })
  }

  const N = docs.length
  const idf = new Map<string, number>()
  for (const [term, count] of df) {
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1)
  }

  for (const doc of docs) {
    let sumSq = 0
    for (const [term, freq] of doc.terms) {
      const w = freq * (idf.get(term) || 1)
      sumSq += w * w
    }
    doc.norm = Math.sqrt(sumSq)
  }

  tfidfCache = { vaultPath, docs, idf }
  return tfidfCache
}

function tfidfSearch(vaultPath: string, query: string, topK: number): { noteId: string; title: string; filePath: string; chunk: string; score: number }[] {
  const { docs, idf } = buildTfIdfIndex(vaultPath)
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const queryTf = new Map<string, number>()
  for (const t of queryTokens) queryTf.set(t, (queryTf.get(t) || 0) + 1)

  let queryNorm = 0
  for (const [term, freq] of queryTf) {
    const w = freq * (idf.get(term) || 1)
    queryNorm += w * w
  }
  queryNorm = Math.sqrt(queryNorm)
  if (queryNorm === 0) return []

  const queryLower = query.toLowerCase()
  const scored: { noteId: string; title: string; filePath: string; chunk: string; score: number }[] = []

  for (const doc of docs) {
    if (doc.norm === 0) continue
    let dot = 0
    for (const [term, qFreq] of queryTf) {
      const docFreq = doc.terms.get(term)
      if (docFreq) {
        const idfVal = idf.get(term) || 1
        dot += (qFreq * idfVal) * (docFreq * idfVal)
      }
    }
    if (dot === 0) continue
    let score = dot / (queryNorm * doc.norm)

    const titleLower = doc.title.toLowerCase()
    if (titleLower.includes(queryLower)) {
      score *= 2.5
    } else if (doc.headingContext.toLowerCase().includes(queryLower)) {
      score *= 1.5
    }

    scored.push({ noteId: doc.noteId, title: doc.title, filePath: doc.filePath, chunk: doc.content, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

function keywordFallbackSearch(vaultPath: string, query: string, topK: number): { noteId: string; title: string; filePath: string; chunk: string; score: number }[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  const db = getDatabase(vaultPath)
  const terms = Array.from(new Set(tokenize(normalized))).slice(0, 8)
  const searchTerms = terms.length > 0 ? terms : [normalized]
  const where = searchTerms.map(() => '(lower(n.title) LIKE ? OR lower(f.content) LIKE ?)').join(' OR ')
  const params = searchTerms.flatMap((term) => [`%${term}%`, `%${term}%`])
  const rows = db.prepare(`
    SELECT n.id as noteId, n.title, n.file_path as filePath, f.content
    FROM notes n
    JOIN notes_fts_map m ON m.note_id = n.id
    JOIN notes_fts f ON f.rowid = m.rowid
    WHERE ${where}
    ORDER BY n.updated_at DESC
    LIMIT ?
  `).all(...params, Math.max(topK * 20, 50)) as { noteId: string; title: string; filePath: string; content: string }[]

  return rows.map((row) => {
    const titleLower = row.title.toLowerCase()
    const contentLower = row.content.toLowerCase()
    const haystack = `${titleLower}\n${contentLower}`
    const exactMatch = haystack.includes(normalized)
    const matchedTerms = searchTerms.filter((term) => haystack.includes(term))
    if (!exactMatch && matchedTerms.length < searchTerms.length) return null

    const lines = row.content
      .split('\n')
      .map((item) => item.trim())
    const line = lines.find((item) => item.toLowerCase().includes(normalized))
      || lines.find((item) => searchTerms.some((term) => item.toLowerCase().includes(term)))
      || row.content.trim().slice(0, 400)
    const titleMatches = searchTerms.filter((term) => titleLower.includes(term)).length

    return {
      noteId: row.noteId,
      title: row.title,
      filePath: row.filePath,
      chunk: line.slice(0, 600),
      score: (exactMatch ? 0.45 : 0.25) + titleMatches * 0.12 + matchedTerms.length * 0.04
    }
  })
    .filter((row): row is { noteId: string; title: string; filePath: string; chunk: string; score: number } => row !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// --- Chat completion reranking ---

async function rerankWithChat(query: string, candidates: { noteId: string; title: string; filePath: string; chunk: string; score: number }[]): Promise<{ noteId: string; title: string; filePath: string; chunk: string; score: number }[]> {
  const config = aiManager.getActiveConfig()
  if (!config || candidates.length === 0) return candidates

  const snippets = candidates.slice(0, 10).map((c, i) => `[${i}] ${c.title}: ${c.chunk.slice(0, 200)}`).join('\n\n')

  const prompt = `你是一个语义相关性评估器。用户搜索: "${query}"

以下是候选文档片段，请按与搜索意图的语义相关性从高到低排序，只返回编号数组（如 [2,0,5,1,3,4]），不要解释。

${snippets}`

  try {
    const provider = aiManager.getProvider(config)
    let response = ''
    for await (const event of provider.chatStream([{ role: 'user', content: prompt }])) {
      if (event.type === 'text') response += event.content
      if (event.type === 'error') return candidates
    }

    const match = response.match(/\[[\d,\s]+\]/)
    if (!match) return candidates

    const indices: number[] = JSON.parse(match[0])
    const reranked: typeof candidates = []
    const top = candidates.slice(0, 10)
    for (const idx of indices) {
      if (idx >= 0 && idx < top.length) {
        reranked.push({ ...top[idx], score: 1 - reranked.length * 0.05 })
      }
    }
    for (const c of top) {
      if (!reranked.find((r) => r.noteId === c.noteId && r.chunk === c.chunk)) {
        reranked.push(c)
      }
    }
    return reranked
  } catch {
    return candidates
  }
}

// --- Public API ---

export async function lexicalSearch(vaultPath: string, query: string, topK = 10): Promise<{ noteId: string; title: string; filePath: string; chunk: string; score: number }[]> {
  const candidates = tfidfSearch(vaultPath, query, topK * 3)
  if (candidates.length === 0) return keywordFallbackSearch(vaultPath, query, topK)

  const deduped: typeof candidates = []
  const seen = new Set<string>()
  for (const c of candidates) {
    if (!seen.has(c.noteId)) {
      seen.add(c.noteId)
      deduped.push(c)
    }
  }

  if (deduped.length <= 1) return deduped.slice(0, topK)

  const topScore = deduped[0].score
  const secondScore = deduped[1].score
  if (topScore > 0.5 || (secondScore > 0 && topScore / secondScore > 2)) {
    return deduped.slice(0, topK)
  }

  const reranked = await rerankWithChat(query, deduped)
  return reranked.slice(0, topK)
}


export async function indexNoteSearchChunks(vaultPath: string, noteId: string, content: string): Promise<boolean> {
  const db = getDatabase(vaultPath)
  const chunks = chunkText(content, noteId)

  const existingChunks = db.prepare(
    'SELECT id, chunk_index, content FROM chunks WHERE note_id = ?'
  ).all(noteId) as { id: string; chunk_index: number; content: string }[]

  const existingMap = new Map(existingChunks.map((c) => [c.chunk_index, c]))

  const changedChunks: TextChunk[] = []
  const unchangedIndexes = new Set<number>()

  for (const chunk of chunks) {
    const existing = existingMap.get(chunk.chunkIndex)
    if (existing?.content === chunk.content) {
      unchangedIndexes.add(chunk.chunkIndex)
    } else {
      changedChunks.push(chunk)
    }
  }

  if (changedChunks.length === 0 && chunks.length === existingChunks.length) return false

  const staleIds = existingChunks
    .filter((c) => !unchangedIndexes.has(c.chunk_index) && c.chunk_index >= chunks.length)
    .map((c) => c.id)

  if (staleIds.length > 0) {
    const placeholders = staleIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM chunks WHERE id IN (${placeholders})`).run(...staleIds)
  }

  if (changedChunks.length === 0) {
    invalidateSearchIndexCache()
    return true
  }

  const upsert = db.prepare(`
    INSERT INTO chunks (id, note_id, chunk_index, content, heading_context, token_count)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content = excluded.content,
      heading_context = excluded.heading_context,
      token_count = excluded.token_count
  `)

  const transaction = db.transaction(() => {
    for (const chunk of changedChunks) {
      upsert.run(
        `${noteId}_${chunk.chunkIndex}`,
        noteId,
        chunk.chunkIndex,
        chunk.content,
        chunk.headingContext,
        chunk.tokenCount
      )
    }
  })

  transaction()
  invalidateSearchIndexCache()
  return true
}

export function findSimilarNotes(vaultPath: string, topK = 3, threshold = 0.75): { sourceId: string; sourceTitle: string; targetId: string; targetTitle: string; score: number }[] {
  const { docs, idf } = buildTfIdfIndex(vaultPath)

  const noteMap = new Map<string, { title: string; filePath: string; terms: Map<string, number>; norm: number }>()
  for (const doc of docs) {
    const existing = noteMap.get(doc.noteId)
    if (!existing) {
      noteMap.set(doc.noteId, { title: doc.title, filePath: doc.filePath, terms: new Map(doc.terms), norm: doc.norm })
    } else {
      for (const [term, freq] of doc.terms) {
        existing.terms.set(term, (existing.terms.get(term) || 0) + freq)
      }
    }
  }

  const notes = Array.from(noteMap.entries()).map(([id, data]) => {
    let norm = 0
    for (const [term, freq] of data.terms) {
      const w = freq * (idf.get(term) || 1)
      norm += w * w
    }
    const folder = data.filePath.split('/').slice(0, -1).join('/') || '_root'
    return { id, title: data.title, folder, terms: data.terms, norm: Math.sqrt(norm) }
  })

  const results: { sourceId: string; sourceTitle: string; targetId: string; targetTitle: string; score: number }[] = []

  for (let i = 0; i < notes.length; i++) {
    const a = notes[i]
    if (a.norm === 0) continue
    const scored: { targetId: string; targetTitle: string; score: number }[] = []

    for (let j = i + 1; j < notes.length; j++) {
      const b = notes[j]
      if (b.norm === 0) continue
      // Only infer cross-folder links
      if (a.folder === b.folder) continue

      let dot = 0
      for (const [term, freqA] of a.terms) {
        const freqB = b.terms.get(term)
        if (freqB) {
          const idfVal = idf.get(term) || 1
          dot += (freqA * idfVal) * (freqB * idfVal)
        }
      }
      if (dot === 0) continue
      const score = dot / (a.norm * b.norm)
      if (score >= threshold) {
        scored.push({ targetId: b.id, targetTitle: b.title, score })
      }
    }

    scored.sort((x, y) => y.score - x.score)
    for (const s of scored.slice(0, topK)) {
      results.push({ sourceId: a.id, sourceTitle: a.title, ...s })
    }
  }

  return results
}
