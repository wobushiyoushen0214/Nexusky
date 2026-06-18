import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { CloudSyncHealth, CloudSyncPreflightRisk } from '@shared/types/ipc'
import { toast } from '../../../stores/toast-store'
import { SettingsLoadingState } from '../SettingsLoadingState'
import { Alert, AlertDescription } from '../../ui/alert'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Input } from '../../ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select'
import { SettingsSection } from '../SettingsSection'
import './CloudSyncSettings.css'

type ProviderType = 'icloud' | 'onedrive' | 'webdav' | 's3'

interface ProviderConfig {
  type: ProviderType
  name: string
  configured: boolean
}

interface ICloudConfig {
  path: string | null
}

interface OneDriveConfig {
  clientId: string
  folder: string
  hasToken: boolean
}

interface WebDavConfig {
  url: string
  username?: string
  folder: string
  hasPassword: boolean
}

interface S3Config {
  endpoint: string
  region: string
  bucket: string
  prefix?: string
  hasAccessKeyId: boolean
  hasSecretAccessKey: boolean
}

export function CloudSyncSettings() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<CloudSyncHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>('icloud')
  const [providers, setProviders] = useState<ProviderConfig[]>([])

  // Provider-specific config states
  const [icloudConfig, setIcloudConfig] = useState<ICloudConfig>({ path: null })
  const [onedriveConfig, setOnedriveConfig] = useState<OneDriveConfig>({
    clientId: '',
    folder: '/Nexusky',
    hasToken: false
  })
  const [webdavConfig, setWebdavConfig] = useState<WebDavConfig>({
    url: '',
    username: '',
    folder: '/Nexusky',
    hasPassword: false
  })
  const [webdavPassword, setWebdavPassword] = useState('')
  const [s3Config, setS3Config] = useState<S3Config>({
    endpoint: '',
    region: 'us-east-1',
    bucket: '',
    prefix: '',
    hasAccessKeyId: false,
    hasSecretAccessKey: false
  })
  const [s3AccessKeyId, setS3AccessKeyId] = useState('')
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('')
  const [icloudDebugInfo, setIcloudDebugInfo] = useState<Array<{ path: string; exists: boolean; accessible: boolean }>>([])
  const [showIcloudDebug, setShowIcloudDebug] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      const [healthResult, providersResult] = await Promise.all([
        window.api.invoke('cloud:get-sync-health', undefined),
        window.api.invoke('cloud:get-all-providers', undefined)
      ])
      setHealth(healthResult)
      setProviders(providersResult.map(p => ({
        type: p.type as ProviderType,
        name: p.name,
        configured: p.configured
      })))

      // Load provider-specific configs
      if (healthResult.activeProvider === 'icloud') {
        const path = await window.api.invoke('cloud:get-icloud-path', undefined)
        setIcloudConfig({ path })
      } else if (healthResult.activeProvider === 'onedrive') {
        const config = await window.api.invoke('cloud:get-onedrive-config', undefined)
        if (config) setOnedriveConfig(config)
      } else if (healthResult.activeProvider === 'webdav') {
        const config = await window.api.invoke('cloud:get-webdav-config', undefined)
        if (config) setWebdavConfig(config)
      } else if (healthResult.activeProvider === 's3') {
        const config = await window.api.invoke('cloud:get-s3-config', undefined)
        if (config) setS3Config(config)
      }
    } catch (error) {
      console.error('Failed to load sync status:', error)
      toast(t('settings.cloudSync.loadFailed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    try {
      const result = await window.api.invoke('cloud:test-connection', { provider: selectedProvider })
      if (result.ok) {
        toast(t('settings.cloudSync.connectionSuccess'), 'success')
      } else {
        toast(result.error || t('settings.cloudSync.connectionFailed'), 'error')
      }
    } catch (error) {
      toast(t('settings.cloudSync.connectionFailed'), 'error')
    }
  }

  const handleShowIcloudDebug = async () => {
    try {
      const debugInfo = await window.api.invoke('cloud:get-icloud-attempted-paths', undefined)
      setIcloudDebugInfo(debugInfo)
      setShowIcloudDebug(true)
    } catch (error) {
      console.error('Failed to get iCloud debug info:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      toast(`获取调试信息失败: ${errorMsg}`, 'error')
    }
  }

  const handleSaveICloudConfig = async () => {
    try {
      if (icloudConfig.path) {
        await window.api.invoke('cloud:set-icloud-path', { path: icloudConfig.path })
      }
      await window.api.invoke('cloud:set-sync-provider', { provider: 'icloud' })
      await loadStatus()
      setConfiguring(false)
      toast(t('settings.cloudSync.configured'), 'success')
    } catch (error) {
      toast(t('settings.cloudSync.configureFailed'), 'error')
    }
  }

  const handleOneDriveAuth = async () => {
    try {
      const result = await window.api.invoke('cloud:onedrive-auth', { clientId: onedriveConfig.clientId })
      if (result.success) {
        await window.api.invoke('cloud:save-onedrive-config', {
          clientId: onedriveConfig.clientId,
          folder: onedriveConfig.folder
        })
        await window.api.invoke('cloud:set-sync-provider', { provider: 'onedrive' })
        await loadStatus()
        setConfiguring(false)
        toast(t('settings.cloudSync.configured'), 'success')
      } else {
        toast(result.error || t('settings.cloudSync.authFailed'), 'error')
      }
    } catch (error) {
      toast(t('settings.cloudSync.authFailed'), 'error')
    }
  }

  const handleSaveWebDavConfig = async () => {
    try {
      await window.api.invoke('cloud:save-webdav-config', {
        url: webdavConfig.url,
        username: webdavConfig.username || '',
        password: webdavPassword || undefined,
        folder: webdavConfig.folder
      })
      await window.api.invoke('cloud:set-sync-provider', { provider: 'webdav' })
      await loadStatus()
      setConfiguring(false)
      setWebdavPassword('')
      toast(t('settings.cloudSync.configured'), 'success')
    } catch (error) {
      toast(t('settings.cloudSync.configureFailed'), 'error')
    }
  }

  const handleSaveS3Config = async () => {
    try {
      const config: Record<string, string> = {
        endpoint: s3Config.endpoint,
        region: s3Config.region,
        bucket: s3Config.bucket,
        prefix: s3Config.prefix || ''
      }
      if (s3AccessKeyId) config.accessKeyId = s3AccessKeyId
      if (s3SecretAccessKey) config.secretAccessKey = s3SecretAccessKey

      await window.api.invoke('cloud:save-s3-config', config as any)
      await window.api.invoke('cloud:set-sync-provider', { provider: 's3' })
      await loadStatus()
      setConfiguring(false)
      setS3AccessKeyId('')
      setS3SecretAccessKey('')
      toast(t('settings.cloudSync.configured'), 'success')
    } catch (error) {
      toast(t('settings.cloudSync.configureFailed'), 'error')
    }
  }

  const handleConfigure = async () => {
    switch (selectedProvider) {
      case 'icloud':
        await handleSaveICloudConfig()
        break
      case 'onedrive':
        await handleOneDriveAuth()
        break
      case 'webdav':
        await handleSaveWebDavConfig()
        break
      case 's3':
        await handleSaveS3Config()
        break
    }
  }

  const renderProviderConfigForm = () => {
    switch (selectedProvider) {
      case 'icloud':
        return (
          <div className="form-fields">
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.icloud.path')}</label>
              <Input
                type="text"
                value={icloudConfig.path || ''}
                onChange={(e) => setIcloudConfig({ path: e.target.value })}
                placeholder={t('settings.cloudSync.icloud.pathPlaceholder')}
              />
              <p className="form-hint">{t('settings.cloudSync.icloud.pathHint')}</p>
            </div>
            <div className="form-item">
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button type="button" variant="outline" size="sm" onClick={handleShowIcloudDebug}>
                  显示路径检测信息
                </Button>
                {selectedProvider === 'icloud' && (
                  <Button type="button" variant="outline" size="sm" onClick={handleTestConnection}>
                    {t('settings.cloudSync.testConnection')}
                  </Button>
                )}
              </div>
            </div>
            {showIcloudDebug && icloudDebugInfo.length > 0 && (
              <Alert className="icloud-debug-alert">
                <AlertDescription>
                  <div className="icloud-debug-info">
                    <p><strong>尝试的路径：</strong></p>
                    <ul>
                      {icloudDebugInfo.map((info, index) => (
                        <li key={index}>
                          <code>{info.path}</code>
                          <br />
                          <span className={info.accessible ? 'status-success' : 'status-error'}>
                            {info.exists
                              ? (info.accessible ? '✓ 可访问' : '✗ 存在但无权限访问')
                              : '✗ 不存在'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!icloudDebugInfo.some(info => info.accessible) && (
                      <div className="icloud-permission-hint">
                        <p><strong>解决方法：</strong></p>
                        <ol>
                          <li>打开"系统偏好设置" → "安全性与隐私" → "隐私"</li>
                          <li>选择左侧的"完全磁盘访问权限"</li>
                          <li>点击锁图标解锁（需要管理员密码）</li>
                          <li>点击"+"按钮，找到并添加 Nexusky 应用</li>
                          <li>重启 Nexusky</li>
                        </ol>
                        <p>或者，手动指定一个可访问的 iCloud Drive 路径。</p>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )

      case 'onedrive':
        return (
          <div className="form-fields">
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.onedrive.clientId')}</label>
              <Input
                type="text"
                value={onedriveConfig.clientId}
                onChange={(e) => setOnedriveConfig({ ...onedriveConfig, clientId: e.target.value })}
                placeholder={t('settings.cloudSync.onedrive.clientIdPlaceholder')}
              />
              <p className="form-hint">{t('settings.cloudSync.onedrive.clientIdHint')}</p>
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.onedrive.folder')}</label>
              <Input
                type="text"
                value={onedriveConfig.folder}
                onChange={(e) => setOnedriveConfig({ ...onedriveConfig, folder: e.target.value })}
                placeholder="/Nexusky"
              />
            </div>
            {onedriveConfig.hasToken && (
              <Alert>
                <AlertDescription>{t('settings.cloudSync.onedrive.authenticated')}</AlertDescription>
              </Alert>
            )}
          </div>
        )

      case 'webdav':
        return (
          <div className="form-fields">
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.webdav.url')}</label>
              <Input
                type="text"
                value={webdavConfig.url}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, url: e.target.value })}
                placeholder="https://webdav.example.com"
              />
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.webdav.username')}</label>
              <Input
                type="text"
                value={webdavConfig.username}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
                placeholder={t('settings.cloudSync.webdav.usernamePlaceholder')}
              />
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.webdav.password')}</label>
              <Input
                type="password"
                value={webdavPassword}
                onChange={(e) => setWebdavPassword(e.target.value)}
                placeholder={webdavConfig.hasPassword ? '••••••••' : t('settings.cloudSync.webdav.passwordPlaceholder')}
              />
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.webdav.folder')}</label>
              <Input
                type="text"
                value={webdavConfig.folder}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, folder: e.target.value })}
                placeholder="/Nexusky"
              />
            </div>
          </div>
        )

      case 's3':
        return (
          <div className="form-fields">
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.s3.endpoint')}</label>
              <Input
                type="text"
                value={s3Config.endpoint}
                onChange={(e) => setS3Config({ ...s3Config, endpoint: e.target.value })}
                placeholder="https://s3.amazonaws.com"
              />
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.s3.region')}</label>
              <Input
                type="text"
                value={s3Config.region}
                onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })}
                placeholder="us-east-1"
              />
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.s3.bucket')}</label>
              <Input
                type="text"
                value={s3Config.bucket}
                onChange={(e) => setS3Config({ ...s3Config, bucket: e.target.value })}
                placeholder="nexusky-sync"
              />
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.s3.prefix')}</label>
              <Input
                type="text"
                value={s3Config.prefix}
                onChange={(e) => setS3Config({ ...s3Config, prefix: e.target.value })}
                placeholder="vault/"
              />
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.s3.accessKeyId')}</label>
              <Input
                type="text"
                value={s3AccessKeyId}
                onChange={(e) => setS3AccessKeyId(e.target.value)}
                placeholder={s3Config.hasAccessKeyId ? '••••••••' : t('settings.cloudSync.s3.accessKeyIdPlaceholder')}
              />
            </div>
            <div className="form-item">
              <label className="form-label">{t('settings.cloudSync.s3.secretAccessKey')}</label>
              <Input
                type="password"
                value={s3SecretAccessKey}
                onChange={(e) => setS3SecretAccessKey(e.target.value)}
                placeholder={s3Config.hasSecretAccessKey ? '••••••••' : t('settings.cloudSync.s3.secretAccessKeyPlaceholder')}
              />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  if (loading) {
    return <SettingsLoadingState className="cloud-sync-settings" label={t('settings.loading')} />
  }

  const preflightRisks = health?.preflightRisks || []

  return (
    <div className="cloud-sync-settings">
      <SettingsSection>
        <div className="section-header">
          <h2>{t('settings.cloudSync.title')}</h2>
          <p>{t('settings.cloudSync.description')}</p>
        </div>

        {!health?.activeProviderConfigured ? (
          <div className="not-configured">
            <Card className="info-card">
              <CardHeader className="info-card__header">
                <CardTitle className="info-card__title">{t('settings.cloudSync.notConfigured')}</CardTitle>
                <CardDescription className="info-card__description">
                  {t('settings.cloudSync.notConfiguredDesc')}
                </CardDescription>
              </CardHeader>
            </Card>

            {configuring && (
              <Card className="config-form">
                <CardHeader className="config-form__header">
                  <CardTitle className="config-form__title">{t('settings.cloudSync.configure')}</CardTitle>
                </CardHeader>
                <CardContent className="config-form__content">
                  <div className="form-item">
                    <label className="form-label">{t('settings.cloudSync.provider')}</label>
                    <Select
                      value={selectedProvider}
                      onValueChange={(value) => setSelectedProvider(value as ProviderType)}
                    >
                      <SelectTrigger className="cloud-sync-provider-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="icloud">iCloud Drive</SelectItem>
                          <SelectItem value="onedrive">OneDrive</SelectItem>
                          <SelectItem value="webdav">WebDAV</SelectItem>
                          <SelectItem value="s3">Amazon S3</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {renderProviderConfigForm()}

                  <div className="form-actions">
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfiguring(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleTestConnection}>
                      {t('settings.cloudSync.testConnection')}
                    </Button>
                    <Button type="button" size="sm" onClick={handleConfigure}>
                      {selectedProvider === 'onedrive'
                        ? t('settings.cloudSync.authenticate')
                        : t('settings.cloudSync.save')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!configuring && (
              <Button type="button" size="sm" className="btn-configure" onClick={() => setConfiguring(true)}>
                {t('settings.cloudSync.startConfiguration')}
              </Button>
            )}
          </div>
        ) : (
          <div className="sync-status">
            <Card className="status-card">
              <CardHeader className="status-card__header">
                <CardTitle className="status-card__title">{t('settings.cloudSync.status')}</CardTitle>
              </CardHeader>
              <CardContent className="status-card__content">
                <div className="status-row">
                  <span>{t('settings.cloudSync.provider')}:</span>
                  <Badge variant="secondary" className="cloud-sync-status-badge">
                    {health.activeProviderName}
                  </Badge>
                </div>
                <div className="status-row">
                  <span>{t('settings.cloudSync.status')}:</span>
                  <Badge
                    variant={health.status === 'error' ? 'outline' : health.status === 'ok' ? 'default' : 'secondary'}
                    className={`cloud-sync-status-badge status-${health.status}`}
                  >
                    {t(`settings.cloudSync.status_${health.status}`)}
                  </Badge>
                </div>
                {health.lastRunAt && (
                  <div className="status-row">
                    <span>{t('settings.cloudSync.lastSync')}:</span>
                    <Badge variant="outline" className="cloud-sync-status-badge">
                      {new Date(health.lastRunAt).toLocaleString()}
                    </Badge>
                  </div>
                )}
                {health.lastDirection && (
                  <div className="status-row">
                    <span>{t('settings.cloudSync.lastDirection')}:</span>
                    <Badge variant="outline" className="cloud-sync-status-badge">
                      {t(`settings.cloudSync.direction_${health.lastDirection}`)}
                    </Badge>
                  </div>
                )}
                {health.lastError && (
                  <Alert variant="destructive" className="cloud-sync-status-alert">
                    <AlertDescription>{health.lastError}</AlertDescription>
                  </Alert>
                )}
                {preflightRisks.length > 0 && (
                  <SyncPreflightRiskList risks={preflightRisks} />
                )}
                <div className="status-stats">
                  <div className="stat-item">
                    <span className="stat-label">{t('settings.cloudSync.stats.total')}:</span>
                    <span className="stat-value">{health.total}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t('settings.cloudSync.stats.pushed')}:</span>
                    <span className="stat-value">{health.pushed}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t('settings.cloudSync.stats.pulled')}:</span>
                    <span className="stat-value">{health.pulled}</span>
                  </div>
                  {health.conflicts > 0 && (
                    <div className="stat-item stat-warning">
                      <span className="stat-label">{t('settings.cloudSync.stats.conflicts')}:</span>
                      <span className="stat-value">{health.conflicts}</span>
                    </div>
                  )}
                  {health.errors > 0 && (
                    <div className="stat-item stat-error">
                      <span className="stat-label">{t('settings.cloudSync.stats.errors')}:</span>
                      <span className="stat-value">{health.errors}</span>
                    </div>
                  )}
                </div>
                {health.offlineQueueSize > 0 && (
                  <Alert className="cloud-sync-status-alert">
                    <AlertDescription>
                      {t('settings.cloudSync.offlineQueue', { count: health.offlineQueueSize })}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
            <div className="sync-actions">
              <Button type="button" variant="outline" size="sm" onClick={() => { setConfiguring(true); setSelectedProvider(health.activeProvider as ProviderType) }}>
                {t('settings.cloudSync.reconfigure')}
              </Button>
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  )
}

function SyncPreflightRiskList({ risks }: { risks: CloudSyncPreflightRisk[] }) {
  const { t } = useTranslation()
  const hasBlocker = risks.some((risk) => risk.severity === 'blocker')
  return (
    <Alert variant={hasBlocker ? 'destructive' : 'default'} className="cloud-sync-status-alert">
      <AlertDescription>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong style={{ fontSize: 12 }}>{t('settings.cloudSync.preflight.title')}</strong>
          {risks.slice(0, 4).map((risk) => (
            <div key={risk.kind} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, lineHeight: 1.45 }}>
              <span>{t(`settings.cloudSync.preflight.${risk.kind}.title`, { count: risk.count })}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>
                {risk.detail || t(`settings.cloudSync.preflight.${risk.kind}.suggestion`)}
              </span>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  )
}
