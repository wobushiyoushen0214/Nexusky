import { ipcMain } from 'electron'
import { getSampleVaults, runTransformation } from '../services/demo-transformation'
import { scanVaultHealth } from '../services/vault-health'
import type { SampleVault, TransformationResult, VaultStats } from '@shared/types/ipc'

export function registerDemoIPC(): void {
  ipcMain.handle('demo:get-sample-vaults', async (): Promise<SampleVault[]> => {
    return getSampleVaults()
  })

  ipcMain.handle('demo:run-transformation', async (_, { vaultPath, vaultId }: { vaultPath: string; vaultId: string }): Promise<TransformationResult> => {
    return await runTransformation(vaultPath, vaultId)
  })

  ipcMain.handle('demo:get-stats', async (_, { vaultPath }: { vaultPath: string }): Promise<VaultStats> => {
    const healthSummary = scanVaultHealth(vaultPath)
    const db = (await import('../services/database')).getDatabase(vaultPath)

    const propertyRow = db.prepare(`
      SELECT COUNT(DISTINCT note_id) as withProps FROM note_properties
    `).get() as { withProps: number }

    const missingPropertyCount = Math.max(0, healthSummary.noteCount - propertyRow.withProps)

    return {
      noteCount: healthSummary.noteCount,
      linkCount: healthSummary.linkCount,
      unresolvedLinkCount: healthSummary.unresolvedLinkCount,
      orphanCount: healthSummary.orphanCount,
      duplicateTitleCount: healthSummary.duplicateTitleCount,
      missingPropertyCount,
      healthScore: healthSummary.score
    }
  })
}
