import { describe, expect, it } from 'vitest'
import { buildPublishWikilinkLookup, expandPublishTransclusions, filterPublishCandidatesByScope, normalizePublishAliases, resolvePublishAssetReferences, resolvePublishWikilinkHref, shouldPublishVaultEntry, toPublishSearchText } from '../packages/main/src/services/publish'

describe('publish wikilink lookup', () => {
  it('resolves published wikilinks by title, filename, nested path, heading, and case variant', () => {
    const lookup = buildPublishWikilinkLookup([
      { title: 'Target Note', relPath: 'Folder/Target Note.md', href: 'Folder/Target Note.html' },
      { title: 'Project', relPath: 'Project.md', href: 'Project.html' }
    ])

    expect(resolvePublishWikilinkHref(lookup, 'Target Note')).toBe('Folder/Target Note.html')
    expect(resolvePublishWikilinkHref(lookup, 'Folder/Target Note')).toBe('Folder/Target Note.html')
    expect(resolvePublishWikilinkHref(lookup, 'Folder/Target Note.md#Details')).toBe('Folder/Target Note.html')
    expect(resolvePublishWikilinkHref(lookup, 'Folder/Target Note.md#^block-1')).toBe('Folder/Target Note.html')
    expect(resolvePublishWikilinkHref(lookup, 'Folder/Target Note^block-1')).toBe('Folder/Target Note.html')
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

  it('keeps Obsidian comments out of published site search text', () => {
    const text = toPublishSearchText([
      '# Roadmap',
      'Visible project note with ==important== context.',
      '%%private launch keyword%%',
      '```md',
      '%%code sample%%',
      '```'
    ].join('\n'))

    expect(text).toContain('Roadmap')
    expect(text).toContain('Visible project note with important context')
    expect(text).not.toContain('private launch keyword')
    expect(text).not.toContain('code sample')
    expect(text).not.toContain('==important==')
  })

  it('expands Obsidian transclusions for published notes', () => {
    const expanded = expandPublishTransclusions('Intro\n\n![[Target#Details|Details Embed]]\n\n![[Target#^block-1]]', [
      {
        title: 'Target',
        relPath: 'Target.md',
        href: 'Target.html',
        body: [
          '# Target',
          '',
          'Opening text.',
          '',
          '## Details',
          'Selected detail.',
          '',
          '## Later',
          'Hidden detail.',
          '',
          'Block text. ^block-1'
        ].join('\n')
      }
    ])

    expect(expanded).toContain('> [!note] Details Embed')
    expect(expanded).toContain('> Selected detail.')
    expect(expanded).toContain('> [!note] Target')
    expect(expanded).toContain('> Block text.')
    expect(expanded).not.toContain('Hidden detail.')
    expect(expanded).not.toContain('^block-1')

    const searchText = toPublishSearchText(expanded)
    expect(searchText).toContain('Selected detail')
    expect(searchText).toContain('Block text')
    expect(searchText).not.toContain('Hidden detail')
  })

  it('filters publish candidates by folder, tag, and property scopes', () => {
    const candidates = [
      { relPath: 'Writing/Public.md', title: 'Public', properties: { tags: ['publish'], status: 'ready', published: true } },
      { relPath: 'Writing/Draft.md', title: 'Draft', properties: { tags: ['draft'], status: 'draft', published: false } },
      { relPath: 'Research/Index.md', title: 'Index', properties: { tags: ['publish'], status: 'ready' } }
    ]

    expect(filterPublishCandidatesByScope(candidates, { type: 'folder', folderPath: 'Writing' }).map((item) => item.relPath)).toEqual(['Writing/Public.md', 'Writing/Draft.md'])
    expect(filterPublishCandidatesByScope(candidates, { type: 'tag', tag: '#publish' }).map((item) => item.relPath)).toEqual(['Writing/Public.md', 'Research/Index.md'])
    expect(filterPublishCandidatesByScope(candidates, { type: 'property', key: 'published', value: 'true' }).map((item) => item.relPath)).toEqual(['Writing/Public.md'])
    expect(filterPublishCandidatesByScope(candidates, { type: 'property', key: 'status' }).map((item) => item.relPath)).toEqual(['Writing/Public.md', 'Writing/Draft.md', 'Research/Index.md'])
  })

  it('resolves local publish asset references from markdown and Obsidian embeds', () => {
    const assets = [
      'Writing/assets/local.png',
      'assets/global.svg',
      '.attachments/diagram.png',
      'Other/duplicate.png',
      'Writing/duplicate.png'
    ]

    expect(resolvePublishAssetReferences([
      '![Local](assets/local.png)',
      '![Global](/assets/global.svg)',
      '![[diagram.png]]',
      '![Remote](https://example.com/remote.png)',
      '![Missing](missing.png)'
    ].join('\n'), 'Writing/Public.md', assets)).toEqual([
      '.attachments/diagram.png',
      'Writing/assets/local.png',
      'assets/global.svg'
    ])

    expect(resolvePublishAssetReferences('![[duplicate.png]]', 'Writing/Public.md', assets)).toEqual(['Writing/duplicate.png'])
  })
})
