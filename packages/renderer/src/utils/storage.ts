/**
 * 安全的 localStorage 包装：
 * - 写入失败（quota exceeded、private mode）静默返回 false
 * - 读取失败返回 null
 * - 不抛异常，调用方不需要 try/catch
 */

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      console.warn(`[storage] quota exceeded for key=${key}, size=${value.length}`)
    }
    return false
  }
}

export function safeRemove(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function safeGetJSON<T>(key: string, fallback: T): T {
  const raw = safeGet(key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function safeSetJSON(key: string, value: unknown): boolean {
  try {
    return safeSet(key, JSON.stringify(value))
  } catch {
    return false
  }
}
