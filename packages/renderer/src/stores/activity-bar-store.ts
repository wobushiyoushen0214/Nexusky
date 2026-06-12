import { create } from 'zustand'
import { ACTIVITY_BAR_REGISTRY } from '../components/sidebar/activity-bar-registry'
import { safeGetJSON, safeSetJSON } from '../utils/storage'

const STORAGE_KEY = 'nexusky-activity-bar'
const PRIMARY_ITEM_ID = 'overview'

interface ActivityBarState {
  visibleIds: string[]
  toggleVisibility: (id: string) => void
  moveItem: (id: string, direction: 'up' | 'down') => void
  resetToDefaults: () => void
}

function getDefaults(): string[] {
  return ACTIVITY_BAR_REGISTRY
    .filter((item) => item.defaultVisible)
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((item) => item.id)
}

function normalizeVisibleIds(ids: string[]): string[] {
  const validIds = new Set(ACTIVITY_BAR_REGISTRY.map((i) => i.id))
  const unique = ids.filter((id, index) => validIds.has(id) && ids.indexOf(id) === index)
  const missingDefaultIds = getDefaults().filter((id) => !unique.includes(id))
  const next = [...unique, ...missingDefaultIds]
  return [PRIMARY_ITEM_ID, ...next.filter((id) => id !== PRIMARY_ITEM_ID)]
}

function load(): string[] {
  const config = safeGetJSON<{ visibleIds?: string[] }>(STORAGE_KEY, {})
  if (!Array.isArray(config.visibleIds)) return normalizeVisibleIds(getDefaults())
  return normalizeVisibleIds(config.visibleIds)
}

function save(visibleIds: string[]) {
  safeSetJSON(STORAGE_KEY, { visibleIds: normalizeVisibleIds(visibleIds) })
}

export const useActivityBarStore = create<ActivityBarState>((set, get) => ({
  visibleIds: load(),

  toggleVisibility: (id) => {
    const item = ACTIVITY_BAR_REGISTRY.find((i) => i.id === id)
    if (!item || item.pinned) return
    const current = get().visibleIds
    const next = current.includes(id)
      ? current.filter((i) => i !== id)
      : [...current, id]
    const normalized = normalizeVisibleIds(next)
    save(normalized)
    set({ visibleIds: normalized })
  },

  moveItem: (id, direction) => {
    const current = [...get().visibleIds]
    const idx = current.indexOf(id)
    if (idx === -1) return
    const item = ACTIVITY_BAR_REGISTRY.find((i) => i.id === id)
    if (item?.pinned) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= current.length) return
    const swapItem = ACTIVITY_BAR_REGISTRY.find((i) => i.id === current[swapIdx])
    if (swapItem?.pinned) return
    ;[current[idx], current[swapIdx]] = [current[swapIdx], current[idx]]
    const normalized = normalizeVisibleIds(current)
    save(normalized)
    set({ visibleIds: normalized })
  },

  resetToDefaults: () => {
    const defaults = normalizeVisibleIds(getDefaults())
    save(defaults)
    set({ visibleIds: defaults })
  },
}))
