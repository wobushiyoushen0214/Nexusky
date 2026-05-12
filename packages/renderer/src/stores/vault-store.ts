import { create } from 'zustand'
import type { FileEntry } from '@shared/types/ipc'

interface VaultState {
  vaultPath: string | null
  files: FileEntry[]
  favorites: string[]
  setVaultPath: (path: string | null) => void
  setFiles: (files: FileEntry[]) => void
  selectVault: () => Promise<void>
  createVault: (name: string) => Promise<void>
  loadVault: () => Promise<void>
  refreshFiles: () => Promise<void>
  indexVault: () => Promise<void>
  toggleFavorite: (path: string) => void
  isFavorite: (path: string) => boolean
}

function loadFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem('nexusky-favorites') || '[]') } catch { return [] }
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vaultPath: null,
  files: [],
  favorites: loadFavorites(),

  setVaultPath: (path) => set({ vaultPath: path }),
  setFiles: (files) => set({ files }),

  toggleFavorite: (path) => {
    const { favorites } = get()
    const next = favorites.includes(path) ? favorites.filter((f) => f !== path) : [...favorites, path]
    localStorage.setItem('nexusky-favorites', JSON.stringify(next))
    set({ favorites: next })
  },

  isFavorite: (path) => get().favorites.includes(path),

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
    const files = await window.api.invoke('file:list-shallow', { dirPath: vaultPath })
    set({ files })
  },

  indexVault: async () => {
    const { vaultPath } = get()
    if (!vaultPath) return
    await window.api.invoke('db:index-vault', { vaultPath })
  }
}))
