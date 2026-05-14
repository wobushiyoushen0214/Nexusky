import { create } from 'zustand'
import { ACTIVITY_BAR_REGISTRY } from '../components/sidebar/activity-bar-registry'

const STORAGE_KEY = 'nexusky-activity-bar'

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

function load(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const config = JSON.parse(saved)
      const validIds = new Set(ACTIVITY_BAR_REGISTRY.map((i) => i.id))
      return (config.visibleIds as string[]).filter((id) => validIds.has(id))
    }
  } catch {}
  return getDefaults()
}

function save(visibleIds: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ visibleIds }))
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
    save(next)
    set({ visibleIds: next })
  },

  moveItem: (id, direction) => {
    const current = [...get().visibleIds]
    const idx = current.indexOf(id)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= current.length) return
    const swapItem = ACTIVITY_BAR_REGISTRY.find((i) => i.id === current[swapIdx])
    if (swapItem?.pinned) return
    ;[current[idx], current[swapIdx]] = [current[swapIdx], current[idx]]
    save(current)
    set({ visibleIds: current })
  },

  resetToDefaults: () => {
    const defaults = getDefaults()
    save(defaults)
    set({ visibleIds: defaults })
  },
}))
