import type { AppLanguage } from '@shared/types/ipc'

let currentAppLanguage: AppLanguage = 'zh-CN'

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return value === 'en' ? 'en' : 'zh-CN'
}

export function setAppLanguage(value: unknown): AppLanguage {
  currentAppLanguage = normalizeAppLanguage(value)
  return currentAppLanguage
}

export function getAppLanguage(): AppLanguage {
  return currentAppLanguage
}

export function resolveAppLanguage(value: unknown): AppLanguage {
  return value === undefined || value === null ? currentAppLanguage : normalizeAppLanguage(value)
}
