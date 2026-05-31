import { describe, expect, it } from 'vitest'
import { getCachedVaultQuery, getCachedVaultQueryWithStats, getDbQueryCacheStats, invalidateVaultQueryCache, invalidateVaultQueryCacheForIndexedFile } from '../packages/main/src/services/db-query-cache'

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

  it('reports cache hit metadata for instrumented callers', () => {
    invalidateVaultQueryCache()
    let calls = 0

    const first = getCachedVaultQueryWithStats('/vault/a', 'instrumented', () => {
      calls += 1
      return { count: calls }
    }, 1000)
    const second = getCachedVaultQueryWithStats('/vault/a', 'instrumented', () => {
      calls += 1
      return { count: calls }
    }, 1000)

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(first.value.count).toBe(1)
    expect(second.value).toBe(first.value)
    expect(first.durationMs).toBeGreaterThanOrEqual(0)
    expect(second.durationMs).toBeGreaterThanOrEqual(0)
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

  it('invalidates only file-related cache entries after an indexed note changes', () => {
    invalidateVaultQueryCache()
    getCachedVaultQuery('/vault/a', 'all-notes', () => 'old-notes')
    getCachedVaultQuery('/vault/a', 'property-rows', () => 'old-properties')
    getCachedVaultQuery('/vault/a', 'recent:20', () => 'old-recent')
    getCachedVaultQuery('/vault/a', 'graph:global:', () => 'old-graph')
    getCachedVaultQuery('/vault/a', 'outgoing:note-a', () => 'old-outgoing-a')
    getCachedVaultQuery('/vault/a', 'outgoing:note-b', () => 'old-outgoing-b')
    getCachedVaultQuery('/vault/a', 'backlinks:note-b', () => 'old-backlinks-b')
    getCachedVaultQuery('/vault/a', 'unlinked:note-b', () => 'old-unlinked-b')
    getCachedVaultQuery('/vault/a', 'maintenance-queue:v1|scan:all', () => 'old-maintenance')
    getCachedVaultQuery('/vault/a', 'ai-usage-summary', () => 'old-ai-usage')
    getCachedVaultQuery('/vault/b', 'all-notes', () => 'old-other-vault')

    invalidateVaultQueryCacheForIndexedFile('/vault/a', { noteId: 'note-a', filePath: 'A.md' })

    expect(getCachedVaultQuery('/vault/a', 'all-notes', () => 'new-notes')).toBe('new-notes')
    expect(getCachedVaultQuery('/vault/a', 'property-rows', () => 'new-properties')).toBe('new-properties')
    expect(getCachedVaultQuery('/vault/a', 'recent:20', () => 'new-recent')).toBe('new-recent')
    expect(getCachedVaultQuery('/vault/a', 'graph:global:', () => 'new-graph')).toBe('new-graph')
    expect(getCachedVaultQuery('/vault/a', 'outgoing:note-a', () => 'new-outgoing-a')).toBe('new-outgoing-a')
    expect(getCachedVaultQuery('/vault/a', 'backlinks:note-b', () => 'new-backlinks-b')).toBe('new-backlinks-b')
    expect(getCachedVaultQuery('/vault/a', 'unlinked:note-b', () => 'new-unlinked-b')).toBe('new-unlinked-b')
    expect(getCachedVaultQuery('/vault/a', 'maintenance-queue:v1|scan:all', () => 'new-maintenance')).toBe('new-maintenance')
    expect(getCachedVaultQuery('/vault/a', 'outgoing:note-b', () => 'new-outgoing-b')).toBe('old-outgoing-b')
    expect(getCachedVaultQuery('/vault/a', 'ai-usage-summary', () => 'new-ai-usage')).toBe('old-ai-usage')
    expect(getCachedVaultQuery('/vault/b', 'all-notes', () => 'new-other-vault')).toBe('old-other-vault')
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
