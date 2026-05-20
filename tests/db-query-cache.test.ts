import { describe, expect, it } from 'vitest'
import { getCachedVaultQuery, getDbQueryCacheStats, invalidateVaultQueryCache } from '../packages/main/src/services/db-query-cache'

describe('database query cache', () => {
  it('returns cached values within the ttl', () => {
    invalidateVaultQueryCache()
    let calls = 0

    const first = getCachedVaultQuery('/vault/a', 'notes', () => {
      calls += 1
      return { count: calls }
    }, 1000)
    const second = getCachedVaultQuery('/vault/a', 'notes', () => {
      calls += 1
      return { count: calls }
    }, 1000)

    expect(first).toBe(second)
    expect(first.count).toBe(1)
    expect(calls).toBe(1)
  })

  it('scopes invalidation to a single vault', () => {
    invalidateVaultQueryCache()
    getCachedVaultQuery('/vault/a', 'notes', () => ['a'])
    getCachedVaultQuery('/vault/b', 'notes', () => ['b'])

    invalidateVaultQueryCache('/vault/a')

    expect(getDbQueryCacheStats().entries).toBe(1)
    expect(getCachedVaultQuery('/vault/b', 'notes', () => ['new-b'])).toEqual(['b'])
    expect(getCachedVaultQuery('/vault/a', 'notes', () => ['new-a'])).toEqual(['new-a'])
  })

  it('reloads expired entries', async () => {
    invalidateVaultQueryCache()
    let calls = 0

    getCachedVaultQuery('/vault/a', 'tags', () => {
      calls += 1
      return calls
    }, 1)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const value = getCachedVaultQuery('/vault/a', 'tags', () => {
      calls += 1
      return calls
    }, 1)

    expect(value).toBe(2)
  })
})
