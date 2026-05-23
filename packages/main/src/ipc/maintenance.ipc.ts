import { ipcMain } from 'electron'
import { gatherMaintenanceItems } from '../services/maintenance/queue-builder'
import { applyMaintenanceFix, type ApplyFixAction } from '../services/maintenance/apply-fix'
import type {
  KnowledgeMaintenanceItem,
  KnowledgeMaintenanceType,
  MaintenanceApplyAction
} from '@shared/types/ipc'

export function registerMaintenanceIPC(): void {
  ipcMain.handle('maintenance:get-queue', async (_event, params: {
    vaultPath: string
    type?: KnowledgeMaintenanceType
    query?: string
    limit?: number
    minCharacters?: number
    upcomingDays?: number
    requiredProperties?: string[]
  }) => {
    return gatherMaintenanceItems({
      vaultPath: params.vaultPath,
      type: params.type,
      query: params.query,
      limit: params.limit,
      minCharacters: params.minCharacters,
      upcomingDays: params.upcomingDays,
      requiredProperties: params.requiredProperties
    })
  })

  ipcMain.handle('maintenance:apply-fix', async (_event, params: {
    vaultPath: string
    item: KnowledgeMaintenanceItem
    action: MaintenanceApplyAction
    payload?: Record<string, unknown>
  }) => {
    return applyMaintenanceFix({
      vaultPath: params.vaultPath,
      item: params.item,
      action: params.action as ApplyFixAction,
      payload: params.payload
    })
  })
}
