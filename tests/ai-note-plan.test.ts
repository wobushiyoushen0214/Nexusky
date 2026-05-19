import { describe, expect, it } from 'vitest'
import { normalizeGeneratedNotePlan } from '../packages/main/src/services/ai/note-plan'

describe('normalizeGeneratedNotePlan', () => {
  it('cleans invalid title characters and strips target directory prefixes', () => {
    const plan = normalizeGeneratedNotePlan([
      { title: 'React/Hooks 入门', brief: 'Basics' },
      { title: 'React - 自定义 Hook', brief: 'Reuse' }
    ], { dirName: 'React' })

    expect(plan.map((item) => item.title)).toEqual(['Hooks 入门', '自定义 Hook'])
  })

  it('deduplicates generated titles without overwriting existing notes', () => {
    const plan = normalizeGeneratedNotePlan([
      { title: 'Hooks', brief: 'A' },
      { title: 'Hooks', brief: 'B' },
      { title: 'Hooks 2', brief: 'C' }
    ], {
      isNameTaken: (title) => title === 'Hooks'
    })

    expect(plan.map((item) => item.title)).toEqual(['Hooks 2', 'Hooks 3', 'Hooks 2 2'])
  })

  it('uses stable fallback titles for empty AI plan items', () => {
    const plan = normalizeGeneratedNotePlan([
      { title: '  ', brief: 'Missing title' },
      { title: '', brief: 'Still missing' }
    ])

    expect(plan.map((item) => item.title)).toEqual(['Untitled 1', 'Untitled 2'])
  })
})
