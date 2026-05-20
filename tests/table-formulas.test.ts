import { describe, expect, it } from 'vitest'
import { calculateMarkdownTableFormulas } from '../packages/shared/src/markdown/table-formulas'

describe('markdown table formulas', () => {
  it('calculates cell references and arithmetic expressions', () => {
    const markdown = [
      '| Item | Price | Qty | Total |',
      '| --- | --- | --- | --- |',
      '| A | 10 | 2 | =B2*C2 |',
      '| B | 4 | 3 | =B3*C3 |'
    ].join('\n')

    const result = calculateMarkdownTableFormulas(markdown)

    expect(result.changed).toBe(true)
    expect(result.formulas).toBe(2)
    expect(result.markdown).toContain('| A | 10 | 2 | 20 |')
    expect(result.markdown).toContain('| B | 4 | 3 | 12 |')
  })

  it('calculates aggregate functions over ranges', () => {
    const markdown = [
      '| Metric | Value |',
      '| --- | --- |',
      '| A | 10 |',
      '| B | 20 |',
      '| C | 30 |',
      '| Sum | =SUM(B2:B4) |',
      '| Avg | =AVG(B2:B4) |',
      '| Min | =MIN(B2:B4) |',
      '| Max | =MAX(B2:B4) |'
    ].join('\n')

    const result = calculateMarkdownTableFormulas(markdown)

    expect(result.formulas).toBe(4)
    expect(result.markdown).toContain('| Sum | 60 |')
    expect(result.markdown).toContain('| Avg | 20 |')
    expect(result.markdown).toContain('| Min | 10 |')
    expect(result.markdown).toContain('| Max | 30 |')
  })

  it('supports formula cells referenced by later formulas', () => {
    const markdown = [
      '| A | B | C |',
      '| --- | --- | --- |',
      '| 2 | 3 | =A2+B2 |',
      '| Total |  | =SUM(C2:C2)+2 |'
    ].join('\n')

    const result = calculateMarkdownTableFormulas(markdown)

    expect(result.markdown).toContain('| 2 | 3 | 5 |')
    expect(result.markdown).toContain('| Total |  | 7 |')
  })

  it('leaves markdown unchanged when no formula exists', () => {
    const markdown = [
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |'
    ].join('\n')

    expect(calculateMarkdownTableFormulas(markdown)).toEqual({
      markdown,
      changed: false,
      formulas: 0
    })
  })
})
