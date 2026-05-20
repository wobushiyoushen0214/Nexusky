import { describe, expect, it } from 'vitest'
import { parseMarkdownFootnotes, stripMarkdownFootnoteDefinitions } from '../packages/shared/src/markdown/footnotes'

describe('markdown footnotes', () => {
  it('parses referenced footnotes in first-reference order', () => {
    const markdown = [
      'A note with a later footnote.[^b]',
      'Another reference.[^a]',
      'Repeated reference.[^b]',
      '',
      '[^a]: First definition',
      '[^b]: Second definition'
    ].join('\n')

    expect(parseMarkdownFootnotes(markdown)).toEqual([
      { id: 'b', number: 1, text: 'Second definition' },
      { id: 'a', number: 2, text: 'First definition' }
    ])
  })

  it('strips definitions and continuation lines from the body', () => {
    const markdown = 'Body.[^1]\n\n[^1]: First line\n  Continued line\nNext paragraph\n'

    expect(stripMarkdownFootnoteDefinitions(markdown)).toBe('Body.[^1]\n\nNext paragraph\n')
    expect(parseMarkdownFootnotes(markdown)).toEqual([
      { id: '1', number: 1, text: 'First line\nContinued line' }
    ])
  })

  it('ignores unreferenced definitions and undefined references', () => {
    const markdown = 'Body.[^missing]\n\n[^unused]: Not shown\n'

    expect(parseMarkdownFootnotes(markdown)).toEqual([])
  })
})
