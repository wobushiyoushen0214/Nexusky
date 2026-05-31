import { ipcMain } from 'electron'
import { gatherMaintenanceItems } from '../services/maintenance/queue-builder'
import { applyMaintenanceFix, type ApplyFixAction } from '../services/maintenance/apply-fix'
import type {
  AppLanguage,
  KnowledgeMaintenanceItem,
  KnowledgeMaintenanceType,
  MaintenanceApplyAction,
  MaintenanceApplyMode
} from '@shared/types/ipc'
import { resolveAppLanguage } from '../services/app-language'

export function registerMaintenanceIPC(): void {
  ipcMain.handle('maintenance:get-queue', async (_event, params: {
    vaultPath: string
    type?: KnowledgeMaintenanceType
    query?: string
    limit?: number
    minCharacters?: number
    upcomingDays?: number
    requiredProperties?: string[]
    language?: AppLanguage
  }) => {
    return gatherMaintenanceItems({
      vaultPath: params.vaultPath,
      type: params.type,
      query: params.query,
      limit: params.limit,
      minCharacters: params.minCharacters,
      upcomingDays: params.upcomingDays,
      requiredProperties: params.requiredProperties,
      language: resolveAppLanguage(params.language)
    })
  })

  ipcMain.handle('maintenance:apply-fix', async (_event, params: {
    vaultPath: string
    item: KnowledgeMaintenanceItem
    action: MaintenanceApplyAction
    mode?: MaintenanceApplyMode
    payload?: Record<string, unknown>
    language?: AppLanguage
  }) => {
    return applyMaintenanceFix({
      vaultPath: params.vaultPath,
      item: params.item,
      action: params.action as ApplyFixAction,
      mode: params.mode,
      payload: params.payload,
      language: resolveAppLanguage(params.language)
    })
  })
}
