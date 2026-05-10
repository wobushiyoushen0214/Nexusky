import { ipcMain } from 'electron'
import { store } from '../services/store'
import { resetClient, CloudConfig } from '../services/cloud/client'
import { syncVault, pushNote } from '../services/cloud/sync'
import { signIn, signUp, signOut, getUser } from '../services/cloud/auth'

export function registerCloudIPC(): void {
  ipcMain.handle('cloud:get-config', () => {
    return store.get('cloudConfig') || { supabaseUrl: '', supabaseKey: '', enabled: false }
  })

  ipcMain.handle('cloud:save-config', (_event, params: { config: CloudConfig }) => {
    store.set('cloudConfig', params.config)
    resetClient()
  })

  ipcMain.handle('cloud:sign-in', async (_event, params: { email: string; password: string }) => {
    return signIn(params.email, params.password)
  })

  ipcMain.handle('cloud:sign-up', async (_event, params: { email: string; password: string }) => {
    return signUp(params.email, params.password)
  })

  ipcMain.handle('cloud:sign-out', async () => {
    await signOut()
  })

  ipcMain.handle('cloud:get-user', async () => {
    return getUser()
  })

  ipcMain.handle('cloud:sync', async (_event, params: { vaultPath: string }) => {
    return syncVault(params.vaultPath)
  })

  ipcMain.handle('cloud:push-file', async (_event, params: { vaultPath: string; filePath: string }) => {
    return pushNote(params.vaultPath, params.filePath)
  })
}
