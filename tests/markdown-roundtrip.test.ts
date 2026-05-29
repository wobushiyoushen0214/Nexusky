import { describe, expect, it } from 'vitest'
import { applySerializedMarkdownEdit, mergeEditorMarkdownContent } from '../packages/renderer/src/utils/markdown-roundtrip'

describe('editor markdown round-trip preservation', () => {
  it('returns the previous source byte-for-byte when the editor produced no markdown change', () => {
    const original = [
      '---',
      'title: "Round Trip"',
      'tags:',
      '  - obsidian',
      '---',
      '# Title',
      '',
      'Text with [[Project|alias]].',
      '',
      '[^1]: Footnote definition',
      ''
    ].join('\r\n')
    const serializedBody = original.replace(/^---\r\n[\s\S]*?\r\n---\r\n/, '').replace(/\r\n/g, '\n')

    expect(mergeEditorMarkdownContent(original, serializedBody, serializedBody)).toBe(original)
  })

  it('applies an unrelated paragraph edit while preserving Obsidian syntax from the original file', () => {
    const original = [
      '---',
      'title: "Obsidian Syntax"',
      'cssclasses:',
      '  - wide-page',
      '---',
      '# Project',
      '',
      'Intro paragraph.',
      '',
      'See [[Roadmap|product roadmap]] and ![[Architecture#API]].',
      'status:: draft',
      '- [ ] Keep task syntax',
      '',
      '> [!note]+ Decision',
      '> Preserve callout text.',
      '',
      'Inline <span data-kind="raw">HTML</span> survives.',
      '',
      '$$',
      'E = mc^2',
      '$$',
      '',
      '```dataview',
      'TABLE status FROM "Projects"',
      '```',
      '',
      '```mermaid',
      'graph TD',
      'A --> B',
      '```',
      '',
      'Footnote ref[^scope].',
      '',
      '[^scope]: Footnote **definition**',
      '  Continued definition.',
      ''
    ].join('\n')

    const previousSerializedBody = [
      '# Project',
      '',
      'Intro paragraph.',
      '',
      'See [[Roadmap|product roadmap]] and ![[Architecture#API]].',
      'status:: draft',
      '- [ ] Keep task syntax',
      '',
      '> [!note]+ Decision',
      '> Preserve callout text.',
      '',
      'Inline HTML survives.',
      '',
      '$$',
      'E = mc^2',
      '$$',
      '',
      '```dataview',
      'TABLE status FROM "Projects"',
      '```',
      '',
      '```mermaid',
      'graph TD',
      'A --> B',
      '```',
      '',
      'Footnote ref[^scope].',
      ''
    ].join('\n')

    const nextSerializedBody = previousSerializedBody.replace('Intro paragraph.', 'Intro paragraph updated.')

    expect(mergeEditorMarkdownContent(original, previousSerializedBody, nextSerializedBody)).toBe(
      original.replace('Intro paragraph.', 'Intro paragraph updated.')
    )
  })

  it('preserves removed-from-editor footnote definitions when editing text after the footnote reference', () => {
    const previousBody = [
      '# Note',
      '',
      'Footnote ref[^a].',
      '',
      '[^a]: Hidden by markdown-it label parsing',
      '',
      'Trailing paragraph.',
      ''
    ].join('\n')
    const previousSerialized = [
      '# Note',
      '',
      'Footnote ref[^a].',
      '',
      'Trailing paragraph.',
      ''
    ].join('\n')
    const nextSerialized = previousSerialized.replace('Trailing paragraph.', 'Trailing paragraph edited.')

    expect(applySerializedMarkdownEdit(previousBody, previousSerialized, nextSerialized)).toBe(
      previousBody.replace('Trailing paragraph.', 'Trailing paragraph edited.')
    )
  })

  it('keeps existing CRLF line endings for preserved content and new editor edits', () => {
    const previousBody = '# Note\r\n\r\nOld paragraph.\r\n\r\n[^a]: Footnote\r\n'
    const previousSerialized = '# Note\n\nOld paragraph.\n'
    const nextSerialized = '# Note\n\nNew paragraph.\n'

    expect(applySerializedMarkdownEdit(previousBody, previousSerialized, nextSerialized)).toBe(
      '# Note\r\n\r\nNew paragraph.\r\n\r\n[^a]: Footnote\r\n'
    )
  })
})
