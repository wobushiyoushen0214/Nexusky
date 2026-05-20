import type { FlashcardQueueItem, FlashcardReviewRating, GeneratedFlashcard } from '@shared/types/ipc'
import { extractJsonFromText } from './json'

const DEFAULT_MAX_FLASHCARDS = 12
const HARD_MAX_FLASHCARDS = 20
const MIN_EASE = 1.3

export interface ParsedFlashcard extends GeneratedFlashcard {
  startLine: number
  endLine: number
  sourceTitle?: string
  status: string
  interval: number
  ease: number
  due: string
}

function cleanText(value: unknown, maxLength = 700): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、\s]+/) : []
  const tags = raw
    .map((tag) => cleanText(tag, 40).replace(/^#/, '').replace(/[^\p{L}\p{N}_/-]/gu, ''))
    .filter((tag) => tag.length > 0)

  return Array.from(new Set(['flashcard', ...tags])).slice(0, 6)
}

function normalizeMaxCards(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_MAX_FLASHCARDS
  return Math.min(HARD_MAX_FLASHCARDS, Math.max(1, Math.floor(numeric)))
}

function getCardList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { cards?: unknown }).cards)) {
    return (parsed as { cards: unknown[] }).cards
  }
  return []
}

export function normalizeGeneratedFlashcards(raw: unknown, maxCards?: number): GeneratedFlashcard[] {
  const parsed = typeof raw === 'string' ? extractJsonFromText(raw) : raw
  const cards: GeneratedFlashcard[] = []
  const seen = new Set<string>()

  for (const item of getCardList(parsed)) {
    if (!item || typeof item !== 'object') continue
    const data = item as Record<string, unknown>
    const type = data.type === 'cloze' ? 'cloze' : 'basic'
    const front = type === 'cloze'
      ? cleanText(data.cloze ?? data.front ?? data.question ?? data.prompt)
      : cleanText(data.front ?? data.question ?? data.prompt)
    const back = cleanText(data.back ?? data.answer ?? data.explanation)
    if (!front || !back) continue

    const key = `${type}\n${front.toLowerCase()}\n${back.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    cards.push({ type, front, back, tags: normalizeTags(data.tags) })
    if (cards.length >= normalizeMaxCards(maxCards)) break
  }

  return cards
}

function escapeWikiTitle(title: string): string {
  return title.replace(/[\[\]\n\r]/g, '').trim()
}

export function getLocalDateStamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLocalDateFromStamp(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return new Date()
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function parseNumber(value: string | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getProperty(lines: string[], key: string): string | undefined {
  const re = new RegExp(`^${key}::\\s*(.*)$`, 'i')
  for (const line of lines) {
    const match = line.match(re)
    if (match) return match[1].trim()
  }
  return undefined
}

function parseTagsLine(value: string | undefined): string[] {
  if (!value) return ['flashcard']
  const tags = value.split(/\s+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
  return Array.from(new Set(tags.length > 0 ? tags : ['flashcard']))
}

function parseBodyField(lines: string[], key: 'Front' | 'Cloze' | 'Back'): string {
  const re = new RegExp(`^\\*\\*${key}:\\*\\*\\s*(.*)$`, 'i')
  const index = lines.findIndex((line) => re.test(line))
  if (index < 0) return ''
  const first = lines[index].replace(re, '$1').trim()
  const continuation: string[] = []
  for (let i = index + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\*\*(Front|Cloze|Back):\*\*/i.test(line) || /^[A-Za-z]+::/.test(line) || /^#{1,6}\s+/.test(line)) break
    if (line.trim()) continuation.push(line.trim())
  }
  return [first, ...continuation].filter(Boolean).join(' ').trim()
}

function getSourceTitle(markdown: string): string | undefined {
  const match = markdown.match(/^Source::\s*\[\[([^\]]+)\]\]/m)
  return match?.[1]?.trim()
}

export function parseFlashcardsFromMarkdown(markdown: string): ParsedFlashcard[] {
  const lines = markdown.split(/\r?\n/)
  const cards: ParsedFlashcard[] = []
  const sourceTitle = getSourceTitle(markdown)

  for (let i = 0; i < lines.length; i++) {
    if (!/^###\s+Card\b/i.test(lines[i])) continue
    let end = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      if (/^###\s+Card\b/i.test(lines[j]) || /^##\s+/.test(lines[j])) {
        end = j
        break
      }
    }

    const block = lines.slice(i, end)
    const type = getProperty(block, 'Type') === 'cloze' ? 'cloze' : 'basic'
    const front = type === 'cloze' ? parseBodyField(block, 'Cloze') : parseBodyField(block, 'Front')
    const back = parseBodyField(block, 'Back')
    if (!front || !back) continue

    cards.push({
      type,
      front,
      back,
      tags: parseTagsLine(getProperty(block, 'Tags')),
      status: getProperty(block, 'Status') || 'new',
      interval: Math.max(0, parseNumber(getProperty(block, 'Interval'), 0)),
      ease: Math.max(MIN_EASE, parseNumber(getProperty(block, 'Ease'), 2.5)),
      due: getProperty(block, 'Due') || getLocalDateStamp(),
      startLine: i + 1,
      endLine: end,
      sourceTitle
    })
  }

  return cards
}

export function getDueFlashcards(markdown: string, today = getLocalDateStamp()): ParsedFlashcard[] {
  return parseFlashcardsFromMarkdown(markdown).filter((card) => card.status === 'new' || !card.due || card.due <= today)
}

export function collectDueFlashcardsFromNotes(notes: { title: string; filePath: string; content: string }[], today = getLocalDateStamp(), limit = 100): { cards: FlashcardQueueItem[]; total: number } {
  const cards = notes.flatMap((note) => getDueFlashcards(note.content, today).map((card) => ({
    ...card,
    title: note.title,
    filePath: note.filePath
  }))).sort((a, b) => {
    const dueCompare = a.due.localeCompare(b.due)
    if (dueCompare !== 0) return dueCompare
    const fileCompare = a.filePath.localeCompare(b.filePath)
    return fileCompare !== 0 ? fileCompare : a.startLine - b.startLine
  })

  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 100
  return { cards: cards.slice(0, normalizedLimit), total: cards.length }
}

function getNextReviewState(card: ParsedFlashcard, rating: FlashcardReviewRating, reviewedAt: Date) {
  const interval = Math.max(0, card.interval)
  const ease = Math.max(MIN_EASE, card.ease)

  if (rating === 'again') {
    return { status: 'learning', interval: 0, ease: Math.max(MIN_EASE, ease - 0.2), due: getLocalDateStamp(reviewedAt) }
  }

  if (rating === 'hard') {
    const nextInterval = Math.max(1, Math.ceil(interval > 0 ? interval * 1.2 : 1))
    return { status: 'review', interval: nextInterval, ease: Math.max(MIN_EASE, ease - 0.15), due: getLocalDateStamp(addDays(reviewedAt, nextInterval)) }
  }

  if (rating === 'easy') {
    const nextEase = ease + 0.15
    const nextInterval = interval > 0 ? Math.ceil(interval * nextEase * 1.3) : 4
    return { status: 'review', interval: nextInterval, ease: nextEase, due: getLocalDateStamp(addDays(reviewedAt, nextInterval)) }
  }

  const nextInterval = interval > 0 ? Math.ceil(interval * ease) : 1
  return { status: 'review', interval: nextInterval, ease, due: getLocalDateStamp(addDays(reviewedAt, nextInterval)) }
}

function setBlockProperty(block: string[], key: string, value: string): string[] {
  const re = new RegExp(`^${key}::`, 'i')
  const index = block.findIndex((line) => re.test(line))
  if (index >= 0) {
    const next = [...block]
    next[index] = `${key}:: ${value}`
    return next
  }

  const insertAfter = Math.max(0, block.findIndex((line, index) => index > 0 && line.trim() === ''))
  const next = [...block]
  next.splice(insertAfter > 0 ? insertAfter : 1, 0, `${key}:: ${value}`)
  return next
}

export function reviewFlashcardInMarkdown(markdown: string, startLine: number, rating: FlashcardReviewRating, reviewedAt = new Date()): string {
  const cards = parseFlashcardsFromMarkdown(markdown)
  const card = cards.find((item) => item.startLine === startLine)
  if (!card) throw new Error('Flashcard not found')

  const lines = markdown.split(/\r?\n/)
  let block = lines.slice(card.startLine - 1, card.endLine)
  const nextState = getNextReviewState(card, rating, reviewedAt)

  block = setBlockProperty(block, 'Status', nextState.status)
  block = setBlockProperty(block, 'Interval', String(nextState.interval))
  block = setBlockProperty(block, 'Ease', String(Number(nextState.ease.toFixed(2))))
  block = setBlockProperty(block, 'Due', nextState.due)
  block = setBlockProperty(block, 'LastReviewed', getLocalDateStamp(reviewedAt))

  return [...lines.slice(0, card.startLine - 1), ...block, ...lines.slice(card.endLine)].join('\n')
}

export function formatFlashcardsMarkdown(cards: GeneratedFlashcard[], sourceTitle?: string, dueDate = getLocalDateStamp()): string {
  const lines = ['## Flashcards', '']
  const title = sourceTitle ? escapeWikiTitle(sourceTitle) : ''
  if (title) {
    lines.push(`Source:: [[${title}]]`, '')
  }

  cards.forEach((card, index) => {
    lines.push(`### Card ${index + 1} · ${card.type === 'cloze' ? 'Cloze' : 'Basic'}`)
    lines.push(`Type:: ${card.type}`)
    lines.push(`Tags:: ${card.tags.map((tag) => `#${tag}`).join(' ')}`)
    lines.push('Status:: new')
    lines.push('Interval:: 0')
    lines.push('Ease:: 2.5')
    lines.push(`Due:: ${dueDate}`)
    lines.push('')
    lines.push(card.type === 'cloze' ? `**Cloze:** ${card.front}` : `**Front:** ${card.front}`)
    lines.push('')
    lines.push(`**Back:** ${card.back}`)
    lines.push('')
  })

  return lines.join('\n').trim()
}
