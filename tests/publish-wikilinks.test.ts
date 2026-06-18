import { describe, expect, it } from 'vitest'
import { buildPublishWikilinkLookup, collectPublishPreviewIssues, collectPublishPreviewRisks, createPublishAccessOutputs, createPublishIncrementalPlan, expandPublishTransclusions, filterPublishCandidatesByScope, getPublishRobotsMeta, normalizePublishAliases, parsePublishManifest, resolvePublishAssetReferences, resolvePublishAssetTargetPath, resolvePublishMarkdownLinkHref, resolvePublishWikilinkHref, serializePublishManifest, shouldPublishVaultEntry, toPublishSearchText } from '../packages/main/src/services/publish'

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
    expect(resolvePublishAssetTargetPath('assets/local.png', 'Writing/Public.md', assets)).toBe('Writing/assets/local.png')
  })

  it('resolves local markdown links and alias-style markdown links for published notes', () => {
    const lookup = buildPublishWikilinkLookup([
      { title: 'Target Note', relPath: 'Writing/Target Note.md', href: 'Writing/Target Note.html', aliases: ['Alias Target'] },
      { title: 'Index', relPath: 'Index.md', href: 'Index.html' }
    ])
    const published = ['Writing/Public.md', 'Writing/Target Note.md', 'Index.md']

    expect(resolvePublishMarkdownLinkHref('Target Note.md#Details', 'Writing/Public.md', lookup, published)).toEqual({ href: 'Writing/Target Note.html#Details', missing: false })
    expect(resolvePublishMarkdownLinkHref('/Index.md', 'Writing/Public.md', lookup, published)).toEqual({ href: 'Index.html', missing: false })
    expect(resolvePublishMarkdownLinkHref('Alias Target', 'Writing/Public.md', lookup, published)).toEqual({ href: 'Writing/Target Note.html', missing: false })
    expect(resolvePublishMarkdownLinkHref('Missing Note', 'Writing/Public.md', lookup, published)).toEqual({ href: '#', missing: true })
    expect(resolvePublishMarkdownLinkHref('assets/local.png', 'Writing/Public.md', lookup, published)).toEqual({ href: 'assets/local.png', missing: false })
  })

  it('collects publish preview link and missing asset issues per note', () => {
    const lookup = buildPublishWikilinkLookup([
      { title: 'Target', relPath: 'Target.md', href: 'Target.html' },
      { title: 'Local', relPath: 'Folder/Local.md', href: 'Folder/Local.html' }
    ])
    const preview = collectPublishPreviewIssues({
      title: 'Source',
      relPath: 'Folder/Source.md',
      body: [
        '# Source',
        'See [[Target]], [local](Local.md), [missing](Missing Note), and [[Gone]].',
        '![Logo](assets/logo.png)',
        '![Missing](assets/missing.png)'
      ].join('\n')
    }, lookup, ['Target.md', 'Folder/Local.md', 'Folder/Source.md'], ['Folder/assets/logo.png'])

    expect(preview.linkCount).toBe(4)
    expect(preview.missingLinks.map((item) => `${item.kind}:${item.target}:${item.line}`)).toEqual([
      'markdown:Missing Note:2',
      'wikilink:Gone:2'
    ])
    expect(preview.missingAssets.map((item) => `${item.target}:${item.line}`)).toEqual(['assets/missing.png:4'])
  })

  it('groups publish preview blockers for wikilinks, local links, assets, and private tags', () => {
    const lookup = buildPublishWikilinkLookup([
      { title: 'Target', relPath: 'Target.md', href: 'Target.html' }
    ])
    const note = {
      title: 'Source',
      relPath: 'Source.md',
      properties: { tags: ['private/project'] },
      body: [
        '# Source',
        'See [[Gone]] and [missing](Missing Note).',
        '![Missing](assets/missing.png)'
      ].join('\n')
    }
    const preview = collectPublishPreviewIssues(note, lookup, ['Source.md', 'Target.md'], [])
    const risks = collectPublishPreviewRisks([note], preview.missingLinks, preview.missingAssets)

    expect(risks.map((risk) => [risk.kind, risk.severity, risk.count])).toEqual([
      ['unresolved_wikilink', 'blocker', 1],
      ['broken_markdown_link', 'blocker', 1],
      ['unpublished_asset', 'blocker', 1],
      ['private_tag', 'blocker', 1]
    ])
    expect(risks[0].examples[0]).toBe('Source.md:2 -> Gone')
    expect(risks[3].examples[0]).toBe('Source.md #private/project')
  })

  it('does not flag private tags hidden inside comments or code blocks', () => {
    const risks = collectPublishPreviewRisks([{
      title: 'Source',
      relPath: 'Source.md',
      body: [
        '%% #private/comment %%',
        '```md',
        '#private/code',
        '```',
        '`#private/inline`'
      ].join('\n')
    }], [], [])

    expect(risks).toEqual([])
  })

  it('builds an incremental publish plan and manifest for changed, unchanged, and removed outputs', () => {
    const initial = createPublishIncrementalPlan([
      { relPath: 'index.html', content: '<html>index</html>' },
      { relPath: 'site-data.js', content: 'window.__NEXUSKY_SEARCH__ = [];' },
      { relPath: 'notes/alpha.html', content: '<html>alpha</html>' },
      { relPath: 'assets/logo.png', content: Buffer.from('logo') }
    ])

    expect(initial.changed.map((item) => item.relPath)).toEqual(['index.html', 'site-data.js', 'notes/alpha.html', 'assets/logo.png'])
    expect(initial.unchanged).toEqual([])
    expect(initial.removed).toEqual([])

    const roundtrip = parsePublishManifest(serializePublishManifest(initial.manifest))
    expect(roundtrip).toEqual(initial.manifest)

    const next = createPublishIncrementalPlan([
      { relPath: 'index.html', content: '<html>index</html>' },
      { relPath: 'site-data.js', content: 'window.__NEXUSKY_SEARCH__ = [{"title":"Alpha"}];' },
      { relPath: 'notes/alpha.html', content: '<html>alpha v2</html>' }
    ], initial.manifest)

    expect(next.changed.map((item) => item.relPath)).toEqual(['site-data.js', 'notes/alpha.html'])
    expect(next.unchanged).toEqual(['index.html'])
    expect(next.removed).toEqual(['assets/logo.png'])
  })

  it('keeps unchanged note pages skipped when only shared publish data changes', () => {
    const previous = createPublishIncrementalPlan([
      { relPath: 'index.html', content: '<html>index with Alpha</html>' },
      { relPath: 'site-data.js', content: 'window.__NEXUSKY_NAV__=[{"title":"Alpha"}];' },
      { relPath: 'notes/alpha.html', content: '<html><nav class="site-nav"></nav><main>alpha</main></html>' }
    ])

    const next = createPublishIncrementalPlan([
      { relPath: 'index.html', content: '<html>index with Alpha and Beta</html>' },
      { relPath: 'site-data.js', content: 'window.__NEXUSKY_NAV__=[{"title":"Alpha"},{"title":"Beta"}];' },
      { relPath: 'notes/alpha.html', content: '<html><nav class="site-nav"></nav><main>alpha</main></html>' },
      { relPath: 'notes/beta.html', content: '<html><nav class="site-nav"></nav><main>beta</main></html>' }
    ], previous.manifest)

    expect(next.changed.map((item) => item.relPath)).toEqual(['index.html', 'site-data.js', 'notes/beta.html'])
    expect(next.unchanged).toEqual(['notes/alpha.html'])
  })

  it('generates publish access control files and noindex metadata for private exports', () => {
    expect(createPublishAccessOutputs('public')).toEqual([
      { relPath: 'robots.txt', content: 'User-agent: *\nAllow: /\n' },
      expect.objectContaining({ relPath: 'access.json', content: expect.stringContaining('"mode": "public"') })
    ])
    expect(createPublishAccessOutputs('private')[0]).toEqual({ relPath: 'robots.txt', content: 'User-agent: *\nDisallow: /\n' })
    expect(createPublishAccessOutputs('private')[1]).toEqual(expect.objectContaining({ relPath: 'access.json', content: expect.stringContaining('"mode": "private"') }))
    expect(getPublishRobotsMeta('private')).toBe('<meta name="robots" content="noindex,nofollow">')
    expect(getPublishRobotsMeta('public')).toBe('')
  })
})
