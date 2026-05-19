import type { CssSnippet } from '@shared/types/ipc'
import { safeGet, safeSet } from './storage'

export const CSS_SNIPPETS_UPDATED = 'css-snippets-updated'

function storageKey(vaultPath: string): string {
  return `nexusky-css-snippets:${vaultPath}`
}

export function getEnabledSnippetNames(vaultPath: string): string[] {
  const raw = safeGet(storageKey(vaultPath))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function setEnabledSnippetNames(vaultPath: string, names: string[]): void {
  safeSet(storageKey(vaultPath), JSON.stringify(Array.from(new Set(names)).sort()))
}

function removeInjectedSnippets(): void {
  document.querySelectorAll('style[data-nexusky-snippet]').forEach((node) => node.remove())
}

export async function loadCssSnippets(vaultPath: string): Promise<CssSnippet[]> {
  return window.api.invoke('snippets:list', { vaultPath })
}

export async function applyCssSnippets(vaultPath: string | null): Promise<void> {
  removeInjectedSnippets()
  if (!vaultPath) return
  const enabled = new Set(getEnabledSnippetNames(vaultPath))
  if (enabled.size === 0) return
  const snippets = await loadCssSnippets(vaultPath)
  for (const snippet of snippets) {
    if (!enabled.has(snippet.name)) continue
    const style = document.createElement('style')
    style.dataset.nexuskySnippet = snippet.name
    style.textContent = `\n/* ${snippet.name} */\n${snippet.content}`
    document.head.appendChild(style)
  }
}
