interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface CachedVaultQueryResult<T> {
  value: T
  cacheHit: boolean
  durationMs: number
}

const DEFAULT_TTL_MS = 3000
const MAX_CACHE_ENTRIES = 200
const cache = new Map<string, CacheEntry<unknown>>()

function makeKey(vaultPath: string, key: string): string {
  return `${vaultPath}::${key}`
}

function trimCache(): void {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (!oldest) return
    cache.delete(oldest)
  }
}

export function getCachedVaultQuery<T>(vaultPath: string, key: string, loader: () => T, ttlMs = DEFAULT_TTL_MS): T {
  return getCachedVaultQueryWithStats(vaultPath, key, loader, ttlMs).value
}

export function getCachedVaultQueryWithStats<T>(
  vaultPath: string,
  key: string,
  loader: () => T,
  ttlMs = DEFAULT_TTL_MS
): CachedVaultQueryResult<T> {
  const startedAt = Date.now()
  const cacheKey = makeKey(vaultPath, key)
  const now = Date.now()
  const hit = cache.get(cacheKey) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > now) {
    cache.delete(cacheKey)
    cache.set(cacheKey, hit)
    return { value: hit.value, cacheHit: true, durationMs: Date.now() - startedAt }
  }
  const value = loader()
  cache.set(cacheKey, { value, expiresAt: now + ttlMs })
  trimCache()
  return { value, cacheHit: false, durationMs: Date.now() - startedAt }
}

export function invalidateVaultQueryCache(vaultPath?: string): number {
  if (!vaultPath) {
    const deleted = cache.size
    cache.clear()
    return deleted
  }
  return invalidateVaultQueryCacheWhere(vaultPath, () => true)
}

export function invalidateVaultQueryCacheWhere(vaultPath: string, predicate: (key: string) => boolean): number {
  const prefix = `${vaultPath}::`
  let deleted = 0
  for (const key of cache.keys()) {
    if (!key.startsWith(prefix)) continue
    const scopedKey = key.slice(prefix.length)
    if (!predicate(scopedKey)) continue
    cache.delete(key)
    deleted += 1
  }
  return deleted
}

export function invalidateVaultQueryCacheForIndexedFile(
  vaultPath: string,
  params: { noteId?: string; filePath?: string } = {}
): number {
  return invalidateVaultQueryCacheWhere(vaultPath, (key) => {
    if (key === 'all-notes' || key === 'property-rows' || key === 'tags') return true
    if (key.startsWith('recent:') || key.startsWith('tag:') || key.startsWith('graph:')) return true
    if (params.noteId && key === `outgoing:${params.noteId}`) return true
    if (key.startsWith('backlinks:') || key.startsWith('unlinked:')) return true
    if (key.startsWith('maintenance-queue:')) return true
    return false
  })
}

export function getDbQueryCacheStats(): { entries: number } {
  return { entries: cache.size }
}
