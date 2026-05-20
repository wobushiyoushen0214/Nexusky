import { describe, expect, it } from 'vitest'
import { parseMarkdownCallouts, renderMarkdownCallouts } from '../packages/shared/src/markdown/callouts'

describe('markdown callouts', () => {
  it('parses Obsidian callouts with title and body', () => {
    const markdown = [
      '> [!warning] Check this',
      '> First line',
      '> Second line',
      '',
      'Plain text'
    ].join('\n')

    expect(parseMarkdownCallouts(markdown)).toEqual([
      { type: 'warning', title: 'Check this', body: 'First line\nSecond line' }
    ])
  })

  it('uses the callout type as the default title', () => {
    expect(parseMarkdownCallouts('> [!tip]\n> Ship small')).toEqual([
      { type: 'tip', title: 'Tip', body: 'Ship small' }
    ])
  })

  it('renders escaped callout HTML and removes source syntax', () => {
    const rendered = renderMarkdownCallouts('> [!danger] <script>x</script>\n> Body <b>bold</b>\n')

    expect(rendered).toContain('class="callout callout-danger"')
    expect(rendered).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(rendered).toContain('Body &lt;b&gt;bold&lt;/b&gt;')
    expect(rendered).not.toContain('[!danger]')
  })

  it('preserves non-callout blockquotes', () => {
    const markdown = '> A regular quote\n'

    expect(renderMarkdownCallouts(markdown)).toBe(markdown)
  })
})
