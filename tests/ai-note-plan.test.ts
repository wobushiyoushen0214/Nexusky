import { describe, expect, it } from 'vitest'
import { normalizeGeneratedNoteBatchPlan, normalizeGeneratedNotePlan } from '../packages/main/src/services/ai/note-plan'

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

  it('removes wikilink boundary characters from generated titles', () => {
    const plan = normalizeGeneratedNotePlan([
      { title: '[[Hooks]] 入门', brief: 'Basics' },
      { title: 'C# 基础', brief: 'Language' },
      { title: '[[Hooks|Hook 用法]]', brief: 'Alias' },
      { title: '[[Hooks#依赖数组|依赖]]', brief: 'Heading' }
    ])

    expect(plan.map((item) => item.title)).toEqual(['Hooks 入门', 'C# 基础', 'Hooks', 'Hooks 2'])
  })

  it('strips target directories after normalizing generated wikilinks', () => {
    const plan = normalizeGeneratedNotePlan([
      { title: '[[React/Hooks]]', brief: 'Basics' },
      { title: '![[React/Effects|Effect 示例]]', brief: 'Embeds' }
    ], { dirName: 'React' })

    expect(plan.map((item) => item.title)).toEqual(['Hooks', 'Effects'])
  })

  it('sanitizes generated batch directories and keeps requested counts bounded', () => {
    const plan = normalizeGeneratedNoteBatchPlan([
      { dir: 'React/../Hooks', topic: 'React Hooks', count: 6 },
      { dir: 'React:Hooks', topic: '', count: 99 },
      { dir: '', topic: 'Vue', count: Number.NaN }
    ], { defaultCount: 5, maxCount: 8 })

    expect(plan).toEqual([
      { dir: 'React/Hooks', topic: 'React Hooks', count: 6 },
      { dir: 'React Hooks', topic: 'React:Hooks', count: 8 },
      { dir: 'Vue', topic: 'Vue', count: 5 }
    ])
  })

  it('deduplicates generated batch directories case-insensitively', () => {
    const plan = normalizeGeneratedNoteBatchPlan([
      { dir: 'React', topic: 'React', count: 5 },
      { dir: 'react', topic: 'React advanced', count: 5 }
    ])

    expect(plan.map((item) => item.dir)).toEqual(['React', 'react 2'])
  })
})
