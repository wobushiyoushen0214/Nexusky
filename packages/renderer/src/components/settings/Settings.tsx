import { useState, useEffect } from 'react'
import { useUIStore } from '../../stores/ui-store'

interface ProviderConfig {
  id: string
  name: string
  type: 'openai' | 'claude' | 'custom'
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-7'],
  custom: []
}

interface SettingsProps {
  open: boolean
  onClose: () => void
}

type Tab = 'appearance' | 'ai' | 'cloud'

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 12px',
  fontSize: 13,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color 150ms',
}

export function Settings({ open, onClose }: SettingsProps) {
  const [tab, setTab] = useState<Tab>('appearance')
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [cloudConfig, setCloudConfig] = useState({ supabaseUrl: '', supabaseKey: '', serviceRoleKey: '', enabled: false })
  const [cloudUser, setCloudUser] = useState<{ email: string } | null>(null)

  useEffect(() => {
    if (open) {
      window.api.invoke('ai:get-providers', undefined).then(setProviders)
      window.api.invoke('cloud:get-config', undefined).then(setCloudConfig)
      window.api.invoke('cloud:get-user', undefined).then(setCloudUser)
    }
  }, [open])

  const saveProviders = async (updated: ProviderConfig[]) => {
    setProviders(updated)
    await window.api.invoke('ai:save-providers', { providers: updated })
  }

  const handleAdd = () => {
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      type: 'openai',
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      enabled: true
    })
  }

  const handleSave = () => {
    if (!editing || !editing.name.trim() || !editing.apiKey.trim()) return
    const exists = providers.find((p) => p.id === editing.id)
    const updated = exists
      ? providers.map((p) => p.id === editing.id ? editing : p)
      : [...providers, editing]
    saveProviders(updated)
    setEditing(null)
  }

  const handleDelete = (id: string) => {
    saveProviders(providers.filter((p) => p.id !== id))
  }

  const handleSetActive = async (id: string) => {
    await window.api.invoke('ai:set-active', { providerId: id })
  }

  if (!open) return null

  return (
    <div
      className="animate-overlay-in"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 12, 20, 0.65)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        style={{ width: 520, maxHeight: '75vh', background: 'var(--bg-surface)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: 14, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ height: 48, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>设置</span>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-subtle)', padding: '0 20px' }}>
          {(['appearance', 'ai', 'cloud'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 500,
                color: tab === t ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 150ms',
              }}
            >
              {{ appearance: '外观', ai: 'AI 提供商', cloud: '云端同步' }[t]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px' }}>
          {tab === 'appearance' && (
            <AppearanceTab />
          )}

          {tab === 'ai' && (<>
            {/* AI header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>已配置</span>
              <button
                onClick={handleAdd}
                style={{ fontSize: 12, color: 'var(--accent-text)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
              >
                + 添加
              </button>
            </div>

            {/* Empty state */}
            {providers.length === 0 && !editing && (
              <div style={{ padding: '32px 0', textAlign: 'center', borderRadius: 8, border: '1px dashed var(--border-default)', background: 'var(--bg-base)' }}>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>未配置 AI 提供商</p>
                <button
                  onClick={handleAdd}
                  style={{ height: 32, padding: '0 16px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                >
                  添加第一个
                </button>
              </div>
            )}

            {/* Provider list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {providers.map((p) => (
                <div key={p.id} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontWeight: 500 }}>{p.type}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => handleSetActive(p.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: 'var(--accent-text)', background: 'transparent', border: 'none', cursor: 'pointer' }}>激活</button>
                      <button onClick={() => setEditing(p)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>编辑</button>
                      <button onClick={() => handleDelete(p.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer' }}>删除</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{p.model} · {p.baseUrl || '默认地址'}</p>
                </div>
              ))}
            </div>

            {/* Edit form */}
            {editing && (
              <div style={{ marginTop: 16, padding: 16, borderRadius: 8, border: '1px solid var(--accent-muted)', background: 'var(--bg-base)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>名称</label>
                    <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      style={inputStyle} placeholder="My OpenAI"
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>类型</label>
                    <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as any, model: DEFAULT_MODELS[e.target.value]?.[0] || '' })}
                      style={{ ...inputStyle, appearance: 'none' as any }}>
                      <option value="openai">OpenAI</option>
                      <option value="claude">Claude</option>
                      <option value="custom">自定义 (OpenAI 兼容)</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>API Key</label>
                  <input type="password" value={editing.apiKey} onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    style={inputStyle} placeholder="sk-..."
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Base URL (留空使用默认)</label>
                  <input value={editing.baseUrl} onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                    style={inputStyle} placeholder="https://api.openai.com/v1"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>模型</label>
                  <input value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    list="model-suggestions" style={inputStyle} placeholder="gpt-4o"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                  <datalist id="model-suggestions">
                    {(DEFAULT_MODELS[editing.type] || []).map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => setEditing(null)} style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>取消</button>
                  <button onClick={handleSave} style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>保存</button>
                </div>
              </div>
            )}
          </>)}

          {tab === 'cloud' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Supabase 配置</span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Supabase URL</label>
                  <input
                    value={cloudConfig.supabaseUrl}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, supabaseUrl: e.target.value })}
                    style={inputStyle}
                    placeholder="https://xxx.supabase.co"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Supabase Anon Key</label>
                  <input
                    type="password"
                    value={cloudConfig.supabaseKey}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, supabaseKey: e.target.value })}
                    style={inputStyle}
                    placeholder="eyJ..."
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--accent-text)', marginBottom: 6, fontWeight: 600 }}>Service Role Key（必填，用于同步和初始化）</label>
                  <input
                    type="password"
                    value={cloudConfig.serviceRoleKey}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, serviceRoleKey: e.target.value })}
                    style={inputStyle}
                    placeholder="eyJ... (Dashboard → Settings → API → service_role)"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={cloudConfig.enabled}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, enabled: e.target.checked })}
                    style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>启用云端同步</span>
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={async () => { await window.api.invoke('cloud:save-config', { config: cloudConfig }) }}
                    style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
                  >
                    保存配置
                  </button>
                  {cloudConfig.supabaseUrl && cloudConfig.supabaseKey && (
                    <button
                      onClick={async () => {
                        await window.api.invoke('cloud:save-config', { config: cloudConfig })
                        const result = await window.api.invoke('cloud:init', undefined)
                        if (result.success) {
                          alert('云端初始化成功！数据库表和 Storage 已创建。')
                        } else {
                          alert(`初始化失败: ${result.error}`)
                        }
                      }}
                      style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }}
                    >
                      一键初始化云端
                    </button>
                  )}
                </div>
              </div>

              {cloudConfig.enabled && (
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>账户</span>
                  {cloudUser ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 6, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cloudUser.email}</span>
                      <button
                        onClick={async () => { await window.api.invoke('cloud:sign-out', undefined); setCloudUser(null) }}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        退出登录
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '10px 12px', borderRadius: 6, background: 'var(--bg-base)', border: '1px dashed var(--border-default)' }}>未登录。配置 Supabase 后可使用 Auth 登录。</p>
                  )}
                </div>
              )}

              {cloudConfig.enabled && (
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>同步</span>
                  <button
                    onClick={async () => {
                      const vaultPath = (await window.api.invoke('vault:get', undefined))
                      if (!vaultPath) return
                      const result = await window.api.invoke('cloud:sync', { vaultPath })
                      if (result.errors.length === 0) {
                        alert(`同步完成！共 ${result.total} 个文件，已同步 ${result.synced} 个。`)
                      } else {
                        alert(`同步完成，但有 ${result.errors.length} 个错误:\n${result.errors.join('\n')}`)
                      }
                    }}
                    style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
                  >
                    立即同步
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AppearanceTab() {
  const { theme, setTheme } = useUIStore()

  const optionStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 80,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    border: active ? '2px solid var(--accent)' : '1px solid var(--border-default)',
    background: active ? 'var(--accent-muted)' : 'var(--bg-elevated)',
    cursor: 'pointer',
    transition: 'all 150ms',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>主题</span>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => setTheme('dark')} style={optionStyle(theme === 'dark')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme === 'dark' ? 'var(--accent-text)' : 'var(--text-tertiary)' }}>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <span style={{ fontSize: 12, color: theme === 'dark' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>深色</span>
        </button>
        <button onClick={() => setTheme('light')} style={optionStyle(theme === 'light')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme === 'light' ? 'var(--accent-text)' : 'var(--text-tertiary)' }}>
            <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <span style={{ fontSize: 12, color: theme === 'light' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>浅色</span>
        </button>
      </div>
    </div>
  )
}