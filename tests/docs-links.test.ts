import { existsSync, readFileSync } from 'fs'
import { dirname, join, normalize } from 'path'
import { describe, expect, it } from 'vitest'

const DOCS_WITH_LOCAL_LINKS = ['README.md', 'docs/PROJECT_OVERVIEW.md']

describe('documentation links', () => {
  it('keeps local markdown links resolvable', () => {
    const missing: string[] = []

    for (const file of DOCS_WITH_LOCAL_LINKS) {
      const markdown = readFileSync(file, 'utf-8')
      for (const href of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = href[1]
        if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('#')) continue
        const pathOnly = target.split('#')[0]
        if (!pathOnly) continue
        const resolved = normalize(join(dirname(file), pathOnly))
        if (!existsSync(resolved)) missing.push(`${file} -> ${target}`)
      }
    }

    expect(missing).toEqual([])
  })
})
