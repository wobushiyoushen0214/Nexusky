import { create } from 'zustand'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

interface SyncState {
  status: SyncStatus
  lastSyncTime: number | null
  lastError: string | null
  setStatus: (status: SyncStatus) => void
  setSuccess: () => void
  setError: (error: string) => void
  setSyncing: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncTime: null,
  lastError: null,
  setStatus: (status) => set({ status }),
  setSuccess: () => set({ status: 'success', lastSyncTime: Date.now(), lastError: null }),
  setError: (error) => set({ status: 'error', lastError: error }),
  setSyncing: () => set({ status: 'syncing' }),
}))
