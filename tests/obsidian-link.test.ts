import { describe, expect, it } from 'vitest'
import { normalizeObsidianLinkTarget } from '../packages/renderer/src/utils/obsidian-link'

describe('Obsidian link utilities', () => {
  it('normalizes headings, block references, aliases, extensions, and separators', () => {
    expect(normalizeObsidianLinkTarget('Folder\\Target.md#Details|label')).toBe('Folder/Target')
    expect(normalizeObsidianLinkTarget('Target#^block-1')).toBe('Target')
    expect(normalizeObsidianLinkTarget('Target^block-1')).toBe('Target')
    expect(normalizeObsidianLinkTarget(' Target | alias ')).toBe('Target')
  })
})
