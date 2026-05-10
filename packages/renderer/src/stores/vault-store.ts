import { create } from 'zustand'
import type { FileEntry } from '@shared/types/ipc'

interface VaultState {
  vaultPath: string | null
  files: FileEntry[]
  setVaultPath: (path: string | null) => void
  setFiles: (files: FileEntry[]) => void
  selectVault: () => Promise<void>
  createVault: (name: string) => Promise<void>
  loadVault: () => Promise<void>
  refreshFiles: () => Promise<void>
  indexVault: () => Promise<void>
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
      await get().indexVault()
    }
  },

  createVault: async (name: string) => {
    const path = await window.api.invoke('vault:create', { name })
    if (path) {
      set({ vaultPath: path })
      await get().refreshFiles()
      await get().indexVault()
    }
  },

  loadVault: async () => {
    const path = await window.api.invoke('vault:get', undefined)
    if (path) {
      set({ vaultPath: path })
      await get().refreshFiles()
      await get().indexVault()
    }
  },

  refreshFiles: async () => {
    const { vaultPath } = get()
    if (!vaultPath) return
    const files = await window.api.invoke('file:list', { dirPath: vaultPath })
    set({ files })
  },

  indexVault: async () => {
    const { vaultPath } = get()
    if (!vaultPath) return
    await window.api.invoke('db:index-vault', { vaultPath })
  }
}))
