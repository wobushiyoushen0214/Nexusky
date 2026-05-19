import type { ThemePackage } from '@shared/types/ipc'
import { safeGet, safeRemove, safeSet } from './storage'

export const THEME_PACKAGES_UPDATED = 'theme-packages-updated'

function storageKey(vaultPath: string): string {
  return `nexusky-theme-package:${vaultPath}`
}

export function getActiveThemePackageId(vaultPath: string): string | null {
  return safeGet(storageKey(vaultPath))
}

export function setActiveThemePackageId(vaultPath: string, id: string | null): void {
  if (!id) {
    safeRemove(storageKey(vaultPath))
    return
  }
  safeSet(storageKey(vaultPath), id)
}

function removeInjectedThemePackage(): void {
  document.querySelectorAll('style[data-nexusky-theme-package]').forEach((node) => node.remove())
}

export async function loadThemePackages(vaultPath: string): Promise<ThemePackage[]> {
  return window.api.invoke('themes:list', { vaultPath })
}

export async function applyThemePackage(vaultPath: string | null): Promise<void> {
  removeInjectedThemePackage()
  if (!vaultPath) return
  const activeId = getActiveThemePackageId(vaultPath)
  if (!activeId) return
  const packages = await loadThemePackages(vaultPath)
  const active = packages.find((theme) => theme.id === activeId)
  if (!active) return
  const style = document.createElement('style')
  style.dataset.nexuskyThemePackage = active.id
  style.textContent = `\n:root {\n${Object.entries(active.colors).map(([key, value]) => `  ${key}: ${value};`).join('\n')}\n}\n`
  document.head.appendChild(style)
}
