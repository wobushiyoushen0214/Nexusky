import { useState, useEffect } from 'react'

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

type Tab = 'ai' | 'cloud'

export function Settings({ open, onClose }: SettingsProps) {
  const [tab, setTab] = useState<Tab>('ai')
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [cloudConfig, setCloudConfig] = useState({ supabaseUrl: '', supabaseKey: '', enabled: false })
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[560px] max-h-[80vh] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="h-11 px-5 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0">
          <span className="text-[14px] font-medium text-[var(--text-primary)]">设置</span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-4 border-b border-[var(--border-subtle)]">
          <button onClick={() => setTab('ai')} className={`pb-2 text-[12px] font-medium border-b-2 transition-colors ${tab === 'ai' ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>AI 提供商</button>
          <button onClick={() => setTab('cloud')} className={`pb-2 text-[12px] font-medium border-b-2 transition-colors ${tab === 'cloud' ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>云端同步</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'ai' && (<>
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-[var(--text-primary)]">AI 提供商</h3>
            <button onClick={handleAdd} className="text-[12px] text-[var(--accent-text)] hover:text-[var(--accent-hover)] transition-colors">
              + 添加
            </button>
          </div>

          {/* Provider list */}
          {providers.length === 0 && !editing && (
            <div className="py-8 text-center">
              <p className="text-[12px] text-[var(--text-tertiary)]">未配置 AI 提供商</p>
              <button onClick={handleAdd} className="mt-2 text-[12px] text-[var(--accent-text)] hover:underline">添加第一个</button>
            </div>
          )}

          {providers.map((p) => (
            <div key={p.id} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">{p.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-tertiary)]">{p.type}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleSetActive(p.id)} className="text-[11px] text-[var(--accent-text)] hover:underline">激活</button>
                  <button onClick={() => setEditing(p)} className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">编辑</button>
                  <button onClick={() => handleDelete(p.id)} className="text-[11px] text-red-400 hover:text-red-300">删除</button>
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)]">{p.model} · {p.baseUrl || '默认地址'}</p>
            </div>
          ))}

          {/* Edit form */}
          {editing && (
            <div className="p-4 rounded-lg border border-[var(--accent)] bg-[var(--bg-surface)] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">名称</label>
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full h-7 px-2 text-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" placeholder="My OpenAI" />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">类型</label>
                  <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as any, model: DEFAULT_MODELS[e.target.value]?.[0] || '' })}
                    className="w-full h-7 px-2 text-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none">
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                    <option value="custom">自定义 (OpenAI 兼容)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">API Key</label>
                <input type="password" value={editing.apiKey} onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                  className="w-full h-7 px-2 text-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" placeholder="sk-..." />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">Base URL (留空使用默认)</label>
                <input value={editing.baseUrl} onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                  className="w-full h-7 px-2 text-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" placeholder="https://api.openai.com/v1" />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">模型</label>
                <input value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  list="model-suggestions"
                  className="w-full h-7 px-2 text-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" placeholder="gpt-4o" />
                <datalist id="model-suggestions">
                  {(DEFAULT_MODELS[editing.type] || []).map((m) => <option key={m} value={m} />)}
                </datalist>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditing(null)} className="h-7 px-3 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">取消</button>
                <button onClick={handleSave} className="h-7 px-3 text-[12px] bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors">保存</button>
              </div>
            </div>
          )}
          </>)}

          {tab === 'cloud' && (
            <div className="space-y-4">
              <h3 className="text-[13px] font-medium text-[var(--text-primary)]">Supabase 配置</h3>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">Supabase URL</label>
                  <input
                    value={cloudConfig.supabaseUrl}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, supabaseUrl: e.target.value })}
                    className="w-full h-7 px-2 text-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder="https://xxx.supabase.co"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">Supabase Anon Key</label>
                  <input
                    type="password"
                    value={cloudConfig.supabaseKey}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, supabaseKey: e.target.value })}
                    className="w-full h-7 px-2 text-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder="eyJ..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cloudConfig.enabled}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, enabled: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-[12px] text-[var(--text-secondary)]">启用云端同步</span>
                </div>
                <button
                  onClick={async () => {
                    await window.api.invoke('cloud:save-config', { config: cloudConfig })
                  }}
                  className="h-7 px-3 text-[12px] bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
                >
                  保存配置
                </button>
              </div>

              {cloudConfig.enabled && (
                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                  <h3 className="text-[13px] font-medium text-[var(--text-primary)]">账户</h3>
                  {cloudUser ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[var(--text-secondary)]">{cloudUser.email}</span>
                      <button
                        onClick={async () => { await window.api.invoke('cloud:sign-out', undefined); setCloudUser(null) }}
                        className="text-[11px] text-red-400 hover:text-red-300"
                      >
                        退出登录
                      </button>
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--text-tertiary)]">未登录。配置 Supabase 后可使用 Auth 登录。</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
