import { describe, expect, it } from 'vitest'
import { collectDueFlashcardsFromNotes, formatFlashcardsMarkdown, getDueFlashcards, getLocalDateFromStamp, getLocalDateStamp, normalizeGeneratedFlashcards, parseFlashcardsFromMarkdown, reviewFlashcardInMarkdown } from '../packages/main/src/services/ai/flashcards'

describe('normalizeGeneratedFlashcards', () => {
  it('parses fenced JSON, normalizes fields, and deduplicates cards', () => {
    const raw = `Here are cards:
\`\`\`json
{
  "cards": [
    { "type": "basic", "question": "What is TF-IDF?", "answer": "A term weighting method.", "tags": ["search"] },
    { "type": "basic", "front": "What is TF-IDF?", "back": "A term weighting method.", "tags": ["duplicate"] },
    { "type": "cloze", "cloze": "Nexusky uses {{c1::wikilinks}} for note relations.", "explanation": "They connect notes.", "tags": "graph, notes" },
    { "type": "basic", "front": "", "back": "Missing front" }
  ]
}
\`\`\``

    expect(normalizeGeneratedFlashcards(raw)).toEqual([
      { type: 'basic', front: 'What is TF-IDF?', back: 'A term weighting method.', tags: ['flashcard', 'search'] },
      { type: 'cloze', front: 'Nexusky uses {{c1::wikilinks}} for note relations.', back: 'They connect notes.', tags: ['flashcard', 'graph', 'notes'] }
    ])
  })

  it('respects the requested card limit', () => {
    const cards = normalizeGeneratedFlashcards([
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' },
      { front: 'Q3', back: 'A3' }
    ], 2)

    expect(cards.map((card) => card.front)).toEqual(['Q1', 'Q2'])
  })
})

describe('formatFlashcardsMarkdown', () => {
  it('formats cards as markdown with source and tags', () => {
    const markdown = formatFlashcardsMarkdown([
      { type: 'basic', front: 'What is a vault?', back: 'A folder of Markdown notes.', tags: ['flashcard', 'nexusky'] },
      { type: 'cloze', front: 'A {{c1::backlink}} points to the current note.', back: 'It helps discover references.', tags: ['flashcard'] }
    ], 'Knowledge Base', '2026-05-20')

    expect(markdown).toContain('## Flashcards')
    expect(markdown).toContain('Source:: [[Knowledge Base]]')
    expect(markdown).toContain('### Card 1 · Basic')
    expect(markdown).toContain('Status:: new')
    expect(markdown).toContain('Interval:: 0')
    expect(markdown).toContain('Ease:: 2.5')
    expect(markdown).toContain('Due:: 2026-05-20')
    expect(markdown).toContain('**Front:** What is a vault?')
    expect(markdown).toContain('Tags:: #flashcard #nexusky')
    expect(markdown).toContain('### Card 2 · Cloze')
    expect(markdown).toContain('**Cloze:** A {{c1::backlink}} points to the current note.')
  })

  it('formats local date stamps without UTC shifting', () => {
    expect(getLocalDateStamp(new Date(2026, 4, 20, 23, 30))).toBe('2026-05-20')
  })

  it('parses local date stamps without UTC shifting', () => {
    expect(getLocalDateStamp(getLocalDateFromStamp('2026-05-20'))).toBe('2026-05-20')
  })
})

describe('flashcard review scheduling', () => {
  const markdown = `# Knowledge Base

## Flashcards

Source:: [[Knowledge Base]]

### Card 1 · Basic
Type:: basic
Tags:: #flashcard #nexusky
Status:: new
Interval:: 0
Ease:: 2.5
Due:: 2026-05-20

**Front:** What is a vault?

**Back:** A folder of Markdown notes.

### Card 2 · Cloze
Type:: cloze
Tags:: #flashcard
Status:: review
Interval:: 3
Ease:: 2.2
Due:: 2026-05-22

**Cloze:** A {{c1::backlink}} points to the current note.

**Back:** It helps discover references.
`

  it('parses flashcards with line ranges and review fields', () => {
    expect(parseFlashcardsFromMarkdown(markdown)).toMatchObject([
      {
        type: 'basic',
        front: 'What is a vault?',
        back: 'A folder of Markdown notes.',
        tags: ['flashcard', 'nexusky'],
        status: 'new',
        interval: 0,
        ease: 2.5,
        due: '2026-05-20',
        startLine: 7,
        sourceTitle: 'Knowledge Base'
      },
      {
        type: 'cloze',
        front: 'A {{c1::backlink}} points to the current note.',
        status: 'review',
        interval: 3,
        ease: 2.2,
        due: '2026-05-22'
      }
    ])
  })

  it('returns new and due cards only', () => {
    const due = getDueFlashcards(markdown, '2026-05-20')

    expect(due).toHaveLength(1)
    expect(due[0].front).toBe('What is a vault?')
  })

  it('collects due flashcards from multiple notes with stable ordering and limits', () => {
    const queue = collectDueFlashcardsFromNotes([
      { title: 'Later', filePath: 'b.md', content: markdown.replace('Due:: 2026-05-20', 'Due:: 2026-05-19') },
      { title: 'Now', filePath: 'a.md', content: markdown }
    ], '2026-05-20', 1)

    expect(queue.total).toBe(2)
    expect(queue.cards).toMatchObject([{ title: 'Later', filePath: 'b.md', due: '2026-05-19' }])
  })

  it('updates a reviewed card with SRS fields', () => {
    const reviewed = reviewFlashcardInMarkdown(markdown, 7, 'good', new Date(2026, 4, 20))

    expect(reviewed).toContain('Status:: review')
    expect(reviewed).toContain('Interval:: 1')
    expect(reviewed).toContain('Ease:: 2.5')
    expect(reviewed).toContain('Due:: 2026-05-21')
    expect(reviewed).toContain('LastReviewed:: 2026-05-20')
    expect(getDueFlashcards(reviewed, '2026-05-20')).toHaveLength(0)
  })

  it('keeps difficult cards due today and lowers ease', () => {
    const reviewed = reviewFlashcardInMarkdown(markdown, 7, 'again', new Date(2026, 4, 20))
    const card = parseFlashcardsFromMarkdown(reviewed)[0]

    expect(card.status).toBe('learning')
    expect(card.interval).toBe(0)
    expect(card.ease).toBe(2.3)
    expect(card.due).toBe('2026-05-20')
  })

  it('schedules hard cards conservatively', () => {
    const reviewed = reviewFlashcardInMarkdown(markdown, 19, 'hard', new Date(2026, 4, 20))
    const card = parseFlashcardsFromMarkdown(reviewed)[1]

    expect(card.status).toBe('review')
    expect(card.interval).toBe(4)
    expect(card.ease).toBe(2.05)
    expect(card.due).toBe('2026-05-24')
  })

  it('schedules easy cards farther out and raises ease', () => {
    const reviewed = reviewFlashcardInMarkdown(markdown, 19, 'easy', new Date(2026, 4, 20))
    const card = parseFlashcardsFromMarkdown(reviewed)[1]

    expect(card.status).toBe('review')
    expect(card.interval).toBe(10)
    expect(card.ease).toBe(2.35)
    expect(card.due).toBe('2026-05-30')
  })
})
