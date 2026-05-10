import { create } from 'zustand'
import { useVaultStore } from './vault-store'

interface EditorState {
  currentFilePath: string | null
  content: string
  isDirty: boolean
  setCurrentFile: (path: string | null) => void
  setContent: (content: string) => void
  setDirty: (dirty: boolean) => void
  openFile: (path: string) => Promise<void>
  saveFile: () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentFilePath: null,
  content: '',
  isDirty: false,

  setCurrentFile: (path) => set({ currentFilePath: path }),
  setContent: (content) => set({ content, isDirty: true }),
  setDirty: (dirty) => set({ isDirty: dirty }),

  openFile: async (path) => {
    const { isDirty } = get()
    if (isDirty) {
      await get().saveFile()
    }
    const content = await window.api.invoke('file:read', { path })
    set({ currentFilePath: path, content, isDirty: false })
  },

  saveFile: async () => {
    const { currentFilePath, content } = get()
    if (!currentFilePath) return
    await window.api.invoke('file:write', { path: currentFilePath, content })
    set({ isDirty: false })

    const vaultPath = useVaultStore.getState().vaultPath
    if (vaultPath) {
      window.api.invoke('db:index-file', { vaultPath, filePath: currentFilePath })
      window.api.invoke('cloud:push-file', { vaultPath, filePath: currentFilePath })
    }
  }
}))
