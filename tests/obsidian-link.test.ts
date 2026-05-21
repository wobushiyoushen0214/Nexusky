import { describe, expect, it } from 'vitest'
import { normalizeObsidianLinkTarget, parseObsidianLinkReference, selectMarkdownReferenceContent } from '../packages/renderer/src/utils/obsidian-link'

describe('Obsidian link utilities', () => {
  it('normalizes headings, block references, aliases, extensions, and separators', () => {
    expect(normalizeObsidianLinkTarget('Folder\\Target.md#Details|label')).toBe('Folder/Target')
    expect(normalizeObsidianLinkTarget('Target#^block-1')).toBe('Target')
    expect(normalizeObsidianLinkTarget('Target^block-1')).toBe('Target')
    expect(normalizeObsidianLinkTarget(' Target | alias ')).toBe('Target')
  })

  it('parses heading and block reference fragments', () => {
    expect(parseObsidianLinkReference('Folder/Target.md#Details|Label')).toMatchObject({
      target: 'Folder/Target',
      label: 'Label',
      fragment: 'Details',
      heading: 'Details'
    })
    expect(parseObsidianLinkReference('Target#^block-1')).toMatchObject({ target: 'Target', blockId: 'block-1' })
    expect(parseObsidianLinkReference('Target^block-1')).toMatchObject({ target: 'Target', blockId: 'block-1' })
  })

  it('selects heading and block content for transclusions', () => {
    const markdown = [
      '# Topic',
      '',
      'Intro paragraph.',
      '',
      '## Details',
      'Useful detail.',
      'Still detail.',
      '',
      '## Later',
      'Later paragraph.',
      '',
      'Standalone block. ^block-1'
    ].join('\n')

    expect(selectMarkdownReferenceContent(markdown, { heading: 'Details' })).toBe('## Details\nUseful detail.\nStill detail.')
    expect(selectMarkdownReferenceContent(markdown, { blockId: 'block-1' })).toBe('Standalone block.')
  })
})
