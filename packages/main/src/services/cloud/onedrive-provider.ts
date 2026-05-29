import { SyncProvider, SyncFileInfo, SyncResult } from './provider'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs'
import { join, relative, dirname, extname } from 'path'
import { createHash } from 'crypto'
import { net, BrowserWindow } from 'electron'
import { logger } from '../logger'
import { store } from '../store'
import { getErrorMessage } from '@shared/utils/errors'
import { readManifest, writeManifest } from './sync-manifest'
import { planSync, manifestFromLocal } from './sync-reconcile'
import { executeSyncPlan, toLocalFileInfos } from './sync-execute'

export interface OneDriveConfig {
  clientId: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  folder: string
}

interface OneDriveTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

interface OneDriveDriveItem {
  name: string
  eTag?: string
  lastModifiedDateTime: string
  folder?: unknown
  file?: {
    hashes?: {
      sha256Hash?: string
    }
  }
}

interface OneDriveChildrenResponse {
  value?: OneDriveDriveItem[]
}

type GraphRequestBody = string | Buffer | Record<string, unknown>

function getConfig(): OneDriveConfig | null {
  const config = store.get('onedriveConfig') as OneDriveConfig | undefined
  if (!config || !config.accessToken) return null
  return config
}

function saveConfig(config: OneDriveConfig): void {
  store.set('onedriveConfig', config)
}

async function graphRequest<T = unknown>(path: string, options: { method?: string; body?: GraphRequestBody; headers?: Record<string, string>; raw?: boolean } = {}): Promise<T> {
  const config = getConfig()
  if (!config) throw new Error('OneDrive 未配置')

  if (Date.now() >= config.expiresAt - 60000) {
    await refreshAccessToken()
  }

  const current = getConfig()!
  const url = `https://graph.microsoft.com/v1.0${path}`
  const method = options.method || 'GET'

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${current.accessToken}`,
    ...options.headers
  }

  const fetchOptions: NonNullable<Parameters<typeof net.fetch>[1]> = { method, headers }
  if (options.body !== undefined) {
    if (typeof options.body === 'string' || Buffer.isBuffer(options.body)) {
      fetchOptions.body = options.body
    } else {
      fetchOptions.body = JSON.stringify(options.body)
      headers['Content-Type'] = 'application/json'
    }
  }

  const response = await net.fetch(url, fetchOptions)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Graph API ${response.status}: ${text}`)
  }

  // 二进制安全：raw 模式直接返回字节，供 index.db 等非文本文件下载使用。
  if (options.raw) {
    return Buffer.from(await response.arrayBuffer()) as T
  }
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return await response.json() as T
  }
  return await response.text() as T
}
async function refreshAccessToken(): Promise<void> {
  const config = getConfig()
  if (!config || !config.refreshToken) throw new Error('无法刷新 token')

  const body = new URLSearchParams({
    client_id: config.clientId,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
    scope: 'Files.ReadWrite.All offline_access'
  })

  const response = await net.fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!response.ok) throw new Error('Token 刷新失败')

  const data = await response.json() as Partial<OneDriveTokenResponse>
  if (!data.access_token || !data.expires_in) throw new Error('Token 刷新响应无效')
  saveConfig({
    ...config,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || config.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000
  })
}

export async function startOneDriveAuth(clientId: string): Promise<{ success: boolean; error?: string }> {
  const redirectUri = 'http://localhost:23847/callback'
  const scope = 'Files.ReadWrite.All offline_access'

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_mode=query`

  return new Promise((resolve) => {
    const win = new BrowserWindow({ width: 600, height: 700, webPreferences: { nodeIntegration: false } })
    win.loadURL(authUrl)

    win.webContents.on('will-redirect', async (_event, url) => {
      if (!url.startsWith(redirectUri)) return
      const code = new URL(url).searchParams.get('code')
      if (!code) { win.close(); resolve({ success: false, error: '授权被取消' }); return }

      try {
        const body = new URLSearchParams({
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope
        })

        const response = await net.fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        })

        if (!response.ok) { win.close(); resolve({ success: false, error: 'Token 交换失败' }); return }

        const data = await response.json() as Partial<OneDriveTokenResponse>
        if (!data.access_token || !data.refresh_token || !data.expires_in) {
          win.close()
          resolve({ success: false, error: 'Token 交换响应无效' })
          return
        }
        saveConfig({
          clientId,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
          folder: '/Nexusky'
        })
        win.close()
        resolve({ success: true })
      } catch (err: unknown) {
        win.close()
        resolve({ success: false, error: getErrorMessage(err) })
      }
    })

    win.on('closed', () => resolve({ success: false, error: '窗口已关闭' }))
  })
}

function collectLocalFiles(dirPath: string): string[] {
  const results: string[] = []
  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (extname(entry.name) === '.md') results.push(full)
    }
  }
  walk(dirPath)
  return results
}
export class OneDriveSyncProvider implements SyncProvider {
  readonly type = 'onedrive' as const
  readonly name = 'OneDrive'

  private get folder(): string {
    return getConfig()?.folder || '/Nexusky'
  }

  isConfigured(): boolean {
    return getConfig() !== null
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await graphRequest('/me/drive')
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, error: getErrorMessage(err) }
    }
  }

  async pushFile(vaultPath: string, filePath: string): Promise<boolean> {
    try {
      const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
      const content = readFileSync(filePath)
      const remotePath = `${this.folder}/${relPath}`
      const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/')

      await graphRequest(`/me/drive/root:${encodedPath}:/content`, {
        method: 'PUT',
        body: content,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      return true
    } catch (err: unknown) {
      logger.error('OneDrive push failed', err)
      return false
    }
  }

  async pullFile(vaultPath: string, relPath: string): Promise<boolean> {
    try {
      const remotePath = `${this.folder}/${relPath}`
      const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/')
      const content = await graphRequest<Buffer>(`/me/drive/root:${encodedPath}:/content`, { raw: true })

      const fullPath = join(vaultPath, relPath)
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, content)
      return true
    } catch (err: unknown) {
      logger.error('OneDrive pull failed', err)
      return false
    }
  }

  async deleteRemote(relPath: string): Promise<boolean> {
    try {
      const remotePath = `${this.folder}/${relPath}`
      const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/')
      await graphRequest(`/me/drive/root:${encodedPath}`, { method: 'DELETE' })
      return true
    } catch (err: unknown) {
      logger.error('OneDrive delete failed', err)
      return false
    }
  }

  async listRemoteFiles(): Promise<SyncFileInfo[]> {
    const results: SyncFileInfo[] = []
    const folder = this.folder

    async function listFolder(path: string): Promise<void> {
      try {
        const encodedPath = path.split('/').map(encodeURIComponent).join('/')
        const data = await graphRequest<OneDriveChildrenResponse>(`/me/drive/root:${encodedPath}:/children`)
        for (const item of data.value || []) {
          if (item.folder) {
            await listFolder(`${path}/${item.name}`)
          } else if (item.name.endsWith('.md')) {
            const relPath = `${path}/${item.name}`.replace(folder + '/', '')
            results.push({
              path: relPath,
              hash: item.file?.hashes?.sha256Hash || item.eTag || '',
              updatedAt: item.lastModifiedDateTime
            })
          }
        }
      } catch { /* folder may not exist yet */ }
    }

    await listFolder(folder)
    return results
  }

  async syncAll(vaultPath: string): Promise<SyncResult> {
    if (!this.isConfigured()) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['OneDrive 未配置'] }

    const remoteFiles = await this.listRemoteFiles()
    const localFiles = toLocalFileInfos(vaultPath, collectLocalFiles(vaultPath))
    const manifest = readManifest(vaultPath, this.type)
    const plan = planSync({ localFiles, remoteFiles, manifest })
    const outcome = await executeSyncPlan(vaultPath, plan, this)
    if (outcome.errors.length === 0) {
      writeManifest(vaultPath, this.type, manifestFromLocal(toLocalFileInfos(vaultPath, collectLocalFiles(vaultPath))))
    }
    return {
      total: localFiles.length,
      pushed: outcome.pushed,
      pulled: outcome.pulled,
      conflicts: plan.conflicts,
      errors: outcome.errors
    }
  }

  async pullAll(vaultPath: string): Promise<SyncResult> {
    if (!this.isConfigured()) return { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: ['OneDrive 未配置'] }

    const result: SyncResult = { total: 0, pushed: 0, pulled: 0, conflicts: [], errors: [] }
    const remoteFiles = await this.listRemoteFiles()
    result.total = remoteFiles.length

    for (const remote of remoteFiles) {
      const fullPath = join(vaultPath, remote.path)
      let needPull = false

      if (!existsSync(fullPath)) {
        needPull = true
      } else {
        const content = readFileSync(fullPath)
        const localHash = createHash('md5').update(content).digest('hex')
        if (localHash !== remote.hash) needPull = true
      }

      if (needPull) {
        const ok = await this.pullFile(vaultPath, remote.path)
        if (ok) result.pulled++
        else result.errors.push(`pull failed: ${remote.path}`)
      }
    }

    return result
  }
}
