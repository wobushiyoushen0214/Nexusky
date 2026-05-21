import { describe, expect, it } from 'vitest'
import { stripMarkdownComments } from '../packages/shared/src/markdown/comments'

describe('markdown comments', () => {
  it('strips inline Obsidian comments', () => {
    expect(stripMarkdownComments('Visible %%hidden note%% text.')).toBe('Visible  text.')
  })

  it('strips multiline Obsidian comments', () => {
    const markdown = [
      'Before',
      '%%',
      'Hidden **markdown**',
      'Still hidden',
      '%%',
      'After'
    ].join('\n')

    expect(stripMarkdownComments(markdown)).toBe('Before\n\nAfter')
  })

  it('keeps comment markers inside inline code and fenced code', () => {
    const markdown = [
      'Use `%%literal%%` here.',
      '',
      '```',
      '%%literal%%',
      '```'
    ].join('\n')

    expect(stripMarkdownComments(markdown)).toBe(markdown)
  })
})
