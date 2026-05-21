import { describe, expect, it } from 'vitest'
import { stripMarkdownComments } from '../packages/shared/src/markdown/comments'
import { renderMarkdownHighlights } from '../packages/shared/src/markdown/highlights'

describe('markdown highlights', () => {
  it('renders Obsidian highlight syntax as mark tags', () => {
    expect(renderMarkdownHighlights('A ==highlighted idea== matters.')).toBe('A <mark>highlighted idea</mark> matters.')
  })

  it('escapes highlighted HTML before rendering', () => {
    expect(renderMarkdownHighlights('A ==<script>alert(1)</script>==')).toBe('A <mark>&lt;script&gt;alert(1)&lt;/script&gt;</mark>')
  })

  it('leaves inline code and fenced code unchanged', () => {
    const markdown = [
      'Use `==literal==` here.',
      '',
      '```',
      '==literal==',
      '```'
    ].join('\n')

    expect(renderMarkdownHighlights(markdown)).toBe(markdown)
  })

  it('preserves surrounding markdown for downstream renderers', () => {
    expect(renderMarkdownHighlights('This is **==important==**.')).toBe('This is **<mark>important</mark>**.')
  })

  it('does not render highlights hidden inside Obsidian comments', () => {
    expect(renderMarkdownHighlights(stripMarkdownComments('Visible %%==hidden==%%'))).toBe('Visible ')
  })
})
