import { describe, expect, it } from 'vitest'
import { parseNoteProperties, updateNoteProperties } from '../packages/renderer/src/utils/frontmatter'

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
})
