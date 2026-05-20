interface CacheEntry<T> {
  value: T
  expiresAt: number
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
  const cacheKey = makeKey(vaultPath, key)
  const now = Date.now()
  const hit = cache.get(cacheKey) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > now) {
    cache.delete(cacheKey)
    cache.set(cacheKey, hit)
    return hit.value
  }
  const value = loader()
  cache.set(cacheKey, { value, expiresAt: now + ttlMs })
  trimCache()
  return value
}

export function invalidateVaultQueryCache(vaultPath?: string): void {
  if (!vaultPath) {
    cache.clear()
    return
  }
  const prefix = `${vaultPath}::`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

export function getDbQueryCacheStats(): { entries: number } {
  return { entries: cache.size }
}
