import { describe, expect, it } from 'vitest'
import { parseNoteProperties, updateFrontmatterProperty, updateMarkdownProperty, updateNoteProperties } from '../packages/renderer/src/utils/frontmatter'

describe('frontmatter properties', () => {
  it('parses Obsidian-style properties', () => {
    const props = parseNoteProperties(`---
title: "Canonical"
aliases:
  - "Alias One"
  - "Alias Two"
tags: [project, #active]
cssclasses:
  - wide-page
---
# Canonical
`)

    expect(props).toEqual({
      title: 'Canonical',
      aliases: ['Alias One', 'Alias Two'],
      tags: ['project', 'active'],
      cssclasses: ['wide-page']
    })
  })

  it('normalizes hash-prefixed Obsidian frontmatter tags', () => {
    const props = parseNoteProperties(`---
tags: "#project #active"
---
# Body
`)

    expect(props.tags).toEqual(['project', 'active'])
  })

  it('parses legacy Obsidian cssclass and migrates it to cssclasses', () => {
    const markdown = `---
cssclass: wide-page readable
---
# Body
`
    const props = parseNoteProperties(markdown)
    const next = updateNoteProperties(markdown, { ...props, cssclasses: ['wide-page', 'readable'] })

    expect(props.cssclasses).toEqual(['wide-page', 'readable'])
    expect(next).not.toContain('cssclass: wide-page readable')
    expect(next).toContain('cssclasses:\n  - "wide-page"\n  - "readable"')
  })

  it('parses CRLF frontmatter from Windows vaults', () => {
    const markdown = '---\r\ntitle: "Windows Note"\r\ntags:\r\n  - "#win"\r\n---\r\n# Body\r\n'
    const props = parseNoteProperties(markdown)
    const next = updateFrontmatterProperty(markdown, 'status', 'active')

    expect(props.title).toBe('Windows Note')
    expect(props.tags).toEqual(['win'])
    expect(next).toContain('status: "active"')
    expect(next).toContain('# Body\r\n')
  })

  it('updates known properties while preserving unknown properties', () => {
    const next = updateNoteProperties(`---
status: draft
alias: Old Alias
tags:
  - old
---
# Body
`, {
      title: 'New Title',
      aliases: ['New Alias'],
      tags: ['project', 'active'],
      cssclasses: []
    })

    expect(next).toContain('status: draft')
    expect(next).toContain('title: "New Title"')
    expect(next).toContain('aliases:\n  - "New Alias"')
    expect(next).toContain('tags:\n  - "project"\n  - "active"')
    expect(next).not.toContain('alias: Old Alias')
    expect(next).toContain('# Body')
  })

  it('creates a frontmatter block when one is missing', () => {
    const next = updateNoteProperties('# Note\n', {
      title: 'Note',
      aliases: [],
      tags: ['idea'],
      cssclasses: []
    })

    expect(next.startsWith('---\n')).toBe(true)
    expect(next).toContain('title: "Note"')
    expect(next).toContain('tags:\n  - "idea"')
    expect(next).toContain('# Note')
  })

  it('updates arbitrary frontmatter properties', () => {
    const next = updateFrontmatterProperty(`---
status: draft
tags:
  - old
---
# Body
`, 'status', 'active')

    expect(next).toContain('status: "active"')
    expect(next).toContain('tags:\n  - old')
    expect(next).toContain('# Body')
  })

  it('writes arbitrary list properties', () => {
    const next = updateFrontmatterProperty('# Body\n', 'aliases', ['One', 'Two'])

    expect(next.startsWith('---\n')).toBe(true)
    expect(next).toContain('aliases:\n  - "One"\n  - "Two"')
    expect(next).toContain('# Body')
  })

  it('preserves primitive frontmatter value types when updating arbitrary properties', () => {
    const next = updateFrontmatterProperty(`---
priority: 2
published: false
---
# Body
`, 'published', true)
    const updated = updateFrontmatterProperty(next, 'priority', 3)

    expect(updated).toContain('published: true')
    expect(updated).toContain('priority: 3')
    expect(updated).not.toContain('published: "true"')
    expect(updated).not.toContain('priority: "3"')
  })

  it('updates existing Dataview inline properties in place', () => {
    const next = updateMarkdownProperty(`# Body

status:: draft
priority:: 2
+ [/] next:: Review draft
- [?] risk:: unclear scope
aliases:: Old Alias
`, 'status', 'active')
    const updated = updateMarkdownProperty(updateMarkdownProperty(updateMarkdownProperty(next, 'aliases', ['One', 'Two']), 'next', 'Publish'), 'risk', null)

    expect(updated.startsWith('---\n')).toBe(false)
    expect(updated).toContain('status:: active')
    expect(updated).toContain('priority:: 2')
    expect(updated).toContain('+ [/] next:: Publish')
    expect(updated).not.toContain('- [?] risk::')
    expect(updated).toContain('aliases:: One, Two')
  })

  it('keeps frontmatter precedence when both frontmatter and Dataview inline fields exist', () => {
    const next = updateMarkdownProperty(`---
status: draft
---
# Body

status:: inline
`, 'status', 'active')

    expect(next).toContain('status: "active"')
    expect(next).toContain('status:: inline')
  })

  it('creates frontmatter when no existing property location exists', () => {
    const next = updateMarkdownProperty('# Body\n', 'status', 'active')

    expect(next.startsWith('---\n')).toBe(true)
    expect(next).toContain('status: "active"')
    expect(next).toContain('# Body')
  })
})
