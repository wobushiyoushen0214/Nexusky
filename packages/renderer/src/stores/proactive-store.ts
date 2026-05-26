import { create } from 'zustand'
import type {
  ProactiveSuggestion,
  ProactiveSuggestionStatus
} from '@shared/types/ipc'

interface ProactiveStoreState {
  suggestions: ProactiveSuggestion[]
  loading: boolean
  drawerOpen: boolean
  lastLoadedVault: string | null
  setDrawerOpen: (open: boolean) => void
  setSuggestions: (rows: ProactiveSuggestion[]) => void
  upsertSuggestion: (suggestion: ProactiveSuggestion) => void
  removeSuggestion: (id: string) => void
  refresh: (vaultPath: string) => Promise<void>
  respond: (vaultPath: string, id: string, status: 'opened' | 'snoozed' | 'dismissed' | 'shown', snoozeUntil?: number | null) => Promise<void>
  respondAll: (vaultPath: string, status: 'opened' | 'dismissed') => Promise<number>
}

const ACTIVE_STATUSES: ProactiveSuggestionStatus[] = ['pending', 'shown']

export const useProactiveStore = create<ProactiveStoreState>((set, get) => ({
  suggestions: [],
  loading: false,
  drawerOpen: false,
  lastLoadedVault: null,

  setDrawerOpen: (open) => set({ drawerOpen: open }),

  setSuggestions: (rows) => set({ suggestions: rows }),

  upsertSuggestion: (suggestion) => set((state) => {
    const idx = state.suggestions.findIndex((s) => s.id === suggestion.id)
    if (idx >= 0) {
      const next = state.suggestions.slice()
      next[idx] = suggestion
      return { suggestions: next }
    }
    return { suggestions: [suggestion, ...state.suggestions] }
  }),

  removeSuggestion: (id) => set((state) => ({
    suggestions: state.suggestions.filter((s) => s.id !== id)
  })),

  refresh: async (vaultPath) => {
    if (!vaultPath) return
    set({ loading: true })
    try {
      const rows = await window.api.invoke('proactive:list', {
        vaultPath,
        status: ACTIVE_STATUSES,
        limit: 100
      })
      set({ suggestions: rows, lastLoadedVault: vaultPath, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  respond: async (vaultPath, id, status, snoozeUntil) => {
    try {
      const updated = await window.api.invoke('proactive:respond', {
        vaultPath,
        id,
        status,
        snoozeUntil: snoozeUntil ?? undefined
      })
      const current = get().suggestions
      if (!updated || status === 'dismissed' || status === 'snoozed' || status === 'opened') {
        set({ suggestions: current.filter((s) => s.id !== id) })
      } else if (updated) {
        const idx = current.findIndex((s) => s.id === id)
        if (idx >= 0) {
          const next = current.slice()
          next[idx] = updated
          set({ suggestions: next })
        }
      }
    } catch {
      // Network errors should not crash the UI; the next refresh will reconcile.
    }
  },

  respondAll: async (vaultPath, status) => {
    try {
      const result = await window.api.invoke('proactive:respond-all', {
        vaultPath,
        status
      })
      set({ suggestions: [] })
      return result.changed
    } catch {
      return 0
    }
  }
}))
