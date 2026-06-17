import { ipcMain } from 'electron'
import { buildMemoryTimeline, updateMemoryCard, explainMemoryCard } from '../services/long-context/memory-timeline'
import { getHeatmap } from '../services/heatmap'
import type { MemoryCard, MemoryCardUpdate } from '@shared/types/ipc'

export function registerMemoryIPC(): void {
  ipcMain.handle('memory:get-timeline', async (_, { vaultPath }: { vaultPath: string }): Promise<MemoryCard[]> => {
    return buildMemoryTimeline(vaultPath)
  })

  ipcMain.handle('memory:update-card', async (_, { vaultPath, id, actions }: { vaultPath: string; id: string; actions: MemoryCardUpdate }): Promise<void> => {
    const archived = actions.archived ?? false
    const pinned = actions.pinned ?? false
    updateMemoryCard(vaultPath, id, archived, pinned)
  })

  ipcMain.handle('memory:explain-card', async (_, { vaultPath, id }: { vaultPath: string; id: string }): Promise<string> => {
    return explainMemoryCard(vaultPath, id)
  })

  ipcMain.handle('memory:get-heatmap', async (_, { vaultPath, startDate, endDate }: { vaultPath: string; startDate?: string; endDate?: string }) => {
    return getHeatmap(vaultPath, startDate, endDate)
  })
}
