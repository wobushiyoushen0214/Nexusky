import { describe, expect, it } from 'vitest'
import {
  buildMemoryContentExcerpt,
  MEMORY_CONTENT_CHAR_BUDGET
} from '../packages/main/src/services/memory'

describe('buildMemoryContentExcerpt', () => {
  it('keeps short note content unchanged', () => {
    const content = '# Short note\n\nThis note fits in the memory prompt budget.'

    expect(buildMemoryContentExcerpt(content)).toEqual({
      text: content,
      truncated: false
    })
  })

  it('samples the beginning, middle, and end of long notes', () => {
    const content = `${'A'.repeat(2500)}${'B'.repeat(2000)}${'C'.repeat(2500)}`

    const excerpt = buildMemoryContentExcerpt(content)

    expect(excerpt.truncated).toBe(true)
    expect(excerpt.text).toContain('[note excerpt: beginning]')
    expect(excerpt.text).toContain('[note excerpt: middle]')
    expect(excerpt.text).toContain('[note excerpt: end]')
    expect(excerpt.text).toContain('A'.repeat(100))
    expect(excerpt.text).toContain('B'.repeat(100))
    expect(excerpt.text).toContain('C'.repeat(100))
    expect(content.length).toBeGreaterThan(MEMORY_CONTENT_CHAR_BUDGET)
    expect(excerpt.text.length).toBeLessThan(content.length)
  })
})
