import { create } from 'zustand'
import type { FileEntry } from '@shared/types/ipc'

interface VaultState {
  vaultPath: string | null
  files: FileEntry[]
  setVaultPath: (path: string | null) => void
  setFiles: (files: FileEntry[]) => void
  selectVault: () => Promise<void>
  loadVault: () => Promise<void>
  refreshFiles: () => Promise<void>
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vaultPath: null,
  files: [],

  setVaultPath: (path) => set({ vaultPath: path }),
  setFiles: (files) => set({ files }),

  selectVault: async () => {
    const path = await window.api.invoke('vault:select', undefined)
    if (path) {
      set({ vaultPath: path })
      await get().refreshFiles()
    }
  },

  loadVault: async () => {
    const path = await window.api.invoke('vault:get', undefined)
    if (path) {
      set({ vaultPath: path })
      await get().refreshFiles()
    }
  },

  refreshFiles: async () => {
    const { vaultPath } = get()
    if (!vaultPath) return
    const files = await window.api.invoke('file:list', { dirPath: vaultPath })
    set({ files })
  }
}))
