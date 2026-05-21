import { describe, expect, it } from 'vitest'
import { buildPublishWikilinkLookup, normalizePublishAliases, resolvePublishWikilinkHref, shouldPublishVaultEntry } from '../packages/main/src/services/publish'

describe('publish wikilink lookup', () => {
  it('resolves published wikilinks by title, filename, nested path, heading, and case variant', () => {
    const lookup = buildPublishWikilinkLookup([
      { title: 'Target Note', relPath: 'Folder/Target Note.md', href: 'Folder/Target Note.html' },
      { title: 'Project', relPath: 'Project.md', href: 'Project.html' }
    ])

    expect(resolvePublishWikilinkHref(lookup, 'Target Note')).toBe('Folder/Target Note.html')
    expect(resolvePublishWikilinkHref(lookup, 'Folder/Target Note')).toBe('Folder/Target Note.html')
    expect(resolvePublishWikilinkHref(lookup, 'Folder/Target Note.md#Details')).toBe('Folder/Target Note.html')
    expect(resolvePublishWikilinkHref(lookup, 'folder/target note')).toBe('Folder/Target Note.html')
    expect(resolvePublishWikilinkHref(lookup, 'PROJECT')).toBe('Project.html')
  })

  it('does not guess published wikilinks when a case-insensitive lookup is ambiguous', () => {
    const lookup = buildPublishWikilinkLookup([
      { title: 'Project', relPath: 'Upper.md', href: 'Upper.html' },
      { title: 'project', relPath: 'Lower.md', href: 'Lower.html' }
    ])

    expect(resolvePublishWikilinkHref(lookup, 'Project')).toBe('Upper.html')
    expect(resolvePublishWikilinkHref(lookup, 'project')).toBe('Lower.html')
    expect(resolvePublishWikilinkHref(lookup, 'PROJECT')).toBe('#')
  })

  it('resolves published wikilinks through Obsidian aliases', () => {
    const lookup = buildPublishWikilinkLookup([
      { title: 'Canonical', relPath: 'Canonical.md', href: 'Canonical.html', aliases: ['Alias Name', 'Short Alias'] }
    ])

    expect(resolvePublishWikilinkHref(lookup, 'Alias Name')).toBe('Canonical.html')
    expect(resolvePublishWikilinkHref(lookup, 'short alias')).toBe('Canonical.html')
  })

  it('normalizes Obsidian alias frontmatter for publishing', () => {
    expect(normalizePublishAliases({ aliases: ['One', 'Two'] })).toEqual(['One', 'Two'])
    expect(normalizePublishAliases({ alias: 'Legacy, Alternate' })).toEqual(['Legacy', 'Alternate'])
  })

  it('keeps hidden user publish content while skipping internal vault folders', () => {
    expect(shouldPublishVaultEntry('.attachments')).toBe(true)
    expect(shouldPublishVaultEntry('.hidden-note.md')).toBe(true)
    expect(shouldPublishVaultEntry('.obsidian')).toBe(false)
    expect(shouldPublishVaultEntry('.nexusky')).toBe(false)
    expect(shouldPublishVaultEntry('.git')).toBe(false)
  })
})
