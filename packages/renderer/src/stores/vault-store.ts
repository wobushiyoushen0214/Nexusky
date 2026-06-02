import { create } from 'zustand'
import { safeGetJSON, safeSetJSON } from '../utils/storage'
import { getErrorMessage } from '../utils/errors'
import type { FileEntry, WorkflowSampleVaultId, WorkflowSampleVaultCreateResult } from '@shared/types/ipc'

export const VAULT_FILES_REFRESHED_EVENT = 'nexusky:vault-files-refreshed'

export interface VaultFilesRefreshedDetail {
  vaultPath: string
  changedPaths: string[]
}

interface VaultState {
  vaultPath: string | null
  files: FileEntry[]
  fileError: string | null
  indexError: string | null
  favorites: string[]
  setVaultPath: (path: string | null) => void
  setFiles: (files: FileEntry[]) => void
  selectVault: () => Promise<void>
  createVault: (name: string) => Promise<void>
  createSampleVault: (sampleId: WorkflowSampleVaultId) => Promise<WorkflowSampleVaultCreateResult | null>
  loadVault: () => Promise<void>
  refreshFiles: (changedPaths?: string[]) => Promise<void>
  indexVault: () => Promise<void>
  toggleFavorite: (path: string) => void
  isFavorite: (path: string) => boolean
}

function loadFavorites(): string[] {
  return safeGetJSON<string[]>('nexusky-favorites', [])
}

let refreshRequestId = 0

export const useVaultStore = create<VaultState>((set, get) => ({
  vaultPath: null,
  files: [],
  fileError: null,
  indexError: null,
  favorites: loadFavorites(),

  setVaultPath: (path) => set({ vaultPath: path, files: [], fileError: null, indexError: null }),
  setFiles: (files) => set({ files }),

  toggleFavorite: (path) => {
    const { favorites } = get()
    const next = favorites.includes(path) ? favorites.filter((f) => f !== path) : [...favorites, path]
    safeSetJSON('nexusky-favorites', next)
    set({ favorites: next })
  },

  isFavorite: (path) => get().favorites.includes(path),

  selectVault: async () => {
    const path = await window.api.invoke('vault:select', undefined)
    if (path) {
      get().setVaultPath(path)
      await get().refreshFiles()
      await get().indexVault()
    }
  },

  createVault: async (name: string) => {
    const path = await window.api.invoke('vault:create', { name })
    if (path) {
      get().setVaultPath(path)
      await get().refreshFiles()
      await get().indexVault()
    }
  },

  createSampleVault: async (sampleId: WorkflowSampleVaultId) => {
    const result = await window.api.invoke('vault:create-sample', { sampleId })
    if (result?.vaultPath) {
      get().setVaultPath(result.vaultPath)
      await get().refreshFiles()
      await get().indexVault()
    }
    return result
  },

  loadVault: async () => {
    const path = await window.api.invoke('vault:get', undefined)
    if (path) {
      get().setVaultPath(path)
      await get().refreshFiles()
      await get().indexVault()
    }
  },

  refreshFiles: async (changedPaths = []) => {
    const { vaultPath } = get()
    if (!vaultPath) return
    const requestId = ++refreshRequestId
    let files: FileEntry[]
    try {
      files = await window.api.invoke('file:list-shallow', { dirPath: vaultPath })
    } catch (error: unknown) {
      if (requestId !== refreshRequestId) return
      set({
        files: [],
        fileError: getErrorMessage(error, '无法读取当前笔记空间')
      })
      return
    }
    if (requestId !== refreshRequestId) return
    set({ files, fileError: null })
    window.dispatchEvent(new CustomEvent<VaultFilesRefreshedDetail>(VAULT_FILES_REFRESHED_EVENT, { detail: { vaultPath, changedPaths } }))
  },

  indexVault: async () => {
    const { vaultPath } = get()
    if (!vaultPath) return
    try {
      await window.api.invoke('db:index-vault', { vaultPath })
      set({ indexError: null })
    } catch (error: unknown) {
      set({ indexError: getErrorMessage(error, '索引当前笔记空间失败') })
    }
  }
}))
