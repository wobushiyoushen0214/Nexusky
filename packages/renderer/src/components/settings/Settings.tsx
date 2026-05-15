import { useState, useEffect, useRef } from 'react'
import { useUIStore } from '../../stores/ui-store'
import { toast } from '../../stores/toast-store'
import { useKeyBindingStore } from '../../stores/keybinding-store'
import { ConfirmModal } from '../ConfirmModal'

interface ProviderConfig {
  id: string
  name: string
  type: 'openai' | 'claude' | 'custom' | 'ollama' | 'codex'
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-5.5', 'gpt-5.4', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  ollama: ['llama3.1', 'qwen2.5', 'deepseek-r1', 'gemma2', 'mistral'],
  codex: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'],
  custom: []
}

const PRESET_MODELS: Record<string, string[]> = {
  'DeepSeek': ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  '通义千问': ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-max', 'qwen3-max-thinking'],
  '智谱 GLM': ['glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-4.5', 'glm-4.5v'],
  'Moonshot': ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  '零一万物': ['yi-lightning', 'yi-large', 'yi-large-turbo', 'yi-medium', 'yi-spark'],
  '豆包': ['doubao-seed-2.0-pro', 'doubao-seed-2.0-lite', 'doubao-1.5-pro-32k', 'doubao-1.5-pro-256k', 'doubao-1.5-thinking-pro'],
}

function getModelsForEditing(editing: ProviderConfig): string[] {
  if (editing.type !== 'custom') return DEFAULT_MODELS[editing.type] || []
  const presetModels = PRESET_MODELS[editing.name]
  if (presetModels) return presetModels
  const allCustom = Object.values(PRESET_MODELS).flat()
  return allCustom
}

const PROVIDER_PRESETS: { label: string; type: ProviderConfig['type']; baseUrl: string; model: string }[] = [
  { label: 'OpenAI', type: 'openai', baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'OpenAI 兼容', type: 'custom', baseUrl: '', model: 'gpt-4.1-mini' },
  { label: 'Codex CLI', type: 'codex', baseUrl: 'codex', model: 'gpt-5.4' },
  { label: 'Claude', type: 'claude', baseUrl: '', model: 'claude-sonnet-4-6' },
  { label: 'DeepSeek', type: 'custom', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { label: '通义千问', type: 'custom', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: '智谱 GLM', type: 'custom', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.1' },
  { label: 'Moonshot', type: 'custom', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6' },
  { label: '零一万物', type: 'custom', baseUrl: 'https://api.lingyiwanwu.com/v1', model: 'yi-lightning' },
  { label: '豆包', type: 'custom', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2.0-pro' },
  { label: 'Ollama (本地)', type: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
]

interface SettingsProps {
  open: boolean
  onClose: () => void
}

type Tab = 'appearance' | 'ai' | 'cloud' | 'keys'

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
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [cloudConfig, setCloudConfig] = useState({ supabaseUrl: '', supabaseKey: '', serviceRoleKey: '', enabled: false })
  const [cloudUser, setCloudUser] = useState<{ email: string } | null>(null)
  const [detectConfirm, setDetectConfirm] = useState(false)
  const overlayPointerDownRef = useRef(false)
  const providerOverlayPointerDownRef = useRef(false)

  useEffect(() => {
    if (open) {
      window.api.invoke('ai:get-providers', undefined).then((ps) => {
        setProviders(ps)
        window.api.invoke('ai:get-active-provider', undefined).then((storedActiveId) => {
          if (storedActiveId && ps.find((p: any) => p.id === storedActiveId)) {
            setActiveProviderId(storedActiveId)
          } else {
            const active = ps.find((p: any) => p.enabled)
            setActiveProviderId(active?.id || ps[0]?.id || null)
          }
        }).catch(() => {
          const active = ps.find((p: any) => p.enabled)
          setActiveProviderId(active?.id || ps[0]?.id || null)
        })
      })
      window.api.invoke('cloud:get-config', undefined).then(setCloudConfig)
      window.api.invoke('cloud:get-user', undefined).then(setCloudUser)
    }
  }, [open])

  const saveProviders = async (updated: ProviderConfig[]) => {
    setProviders(updated)
    await window.api.invoke('ai:save-providers', { providers: updated })
  }

  const handleAdd = (preset?: typeof PROVIDER_PRESETS[0]) => {
    setEditing({
      id: crypto.randomUUID(),
      name: preset?.label || '',
      type: preset?.type || 'openai',
      baseUrl: preset?.baseUrl || '',
      apiKey: '',
      model: preset?.model || 'gpt-4.1-mini',
      enabled: true
    })
  }

  const handleSave = () => {
    if (!editing) return
    const normalized = {
      ...editing,
      name: editing.name.trim(),
      apiKey: editing.apiKey.trim(),
      baseUrl: editing.type === 'codex' && !editing.baseUrl.trim() ? 'codex' : editing.baseUrl.trim()
    }
    if (!normalized.name) {
      toast('请填写提供商名称', 'error')
      return
    }
    if (!['ollama', 'codex'].includes(normalized.type) && !normalized.apiKey) {
      toast('请填写 API Key', 'error')
      return
    }
    if (normalized.type === 'custom' && !normalized.baseUrl) {
      toast('请填写 OpenAI 兼容接口的 Base URL', 'error')
      return
    }
    const exists = providers.find((p) => p.id === editing.id)
    const updated = exists
      ? providers.map((p) => p.id === editing.id ? normalized : p)
      : [...providers, normalized]
    saveProviders(updated)
    setEditing(null)
  }

  const handleDelete = (id: string) => {
    saveProviders(providers.filter((p) => p.id !== id))
  }

  const handleSetActive = async (id: string) => {
    await window.api.invoke('ai:set-active', { providerId: id })
    setActiveProviderId(id)
    const provider = providers.find((p) => p.id === id)
    toast(`已激活: ${provider?.name || 'AI 提供商'}`, 'success')
  }

  if (!open) return null

  return (
    <div
      className="animate-overlay-in"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10, 12, 20, 0.65)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as React.CSSProperties}
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (overlayPointerDownRef.current && e.target === e.currentTarget) onClose()
        overlayPointerDownRef.current = false
      }}
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
          {(['appearance', 'ai', 'cloud', 'keys'] as Tab[]).map((t) => (
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
              {{ appearance: '外观', ai: 'AI 提供商', cloud: '云端同步', keys: '快捷键' }[t]}
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setDetectConfirm(true)}
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', cursor: 'pointer', padding: '3px 8px', borderRadius: 4 }}
                >
                  自动检测
                </button>
                <button
                  onClick={() => handleAdd()}
                  style={{ fontSize: 12, color: 'var(--accent-text)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
                >
                  + 添加
                </button>
              </div>
            </div>

            {/* Quick presets */}
            {providers.length === 0 && !editing && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>快速添加</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handleAdd(preset)}
                      style={{ height: 28, padding: '0 10px', fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer', transition: 'all 100ms' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-text)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Provider list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {providers.map((p) => {
                const isActive = p.id === activeProviderId
                return (
                <div key={p.id} style={{ padding: '12px 14px', borderRadius: 8, border: isActive ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)', background: isActive ? 'var(--accent-muted)' : 'var(--bg-base)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</span>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999, background: 'var(--accent-muted)', color: 'var(--accent-text)', fontWeight: 500 }}>{p.type}</span>
                      {isActive && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 9999, background: 'rgba(74, 222, 128, 0.12)', color: '#4ade80', fontWeight: 500 }}>使用中</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {!isActive && <button onClick={() => handleSetActive(p.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: '#fff', background: 'var(--accent)', border: 'none', cursor: 'pointer', fontWeight: 500 }}>激活</button>}
                      <button onClick={() => setEditing(p)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>编辑</button>
                      <button onClick={() => handleDelete(p.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer' }}>删除</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{p.model} · {p.type === 'codex' ? (p.baseUrl || 'codex') : (p.baseUrl || '默认地址')}</p>
                </div>
                )
              })}
            </div>

            {/* Quick add presets (when providers exist) */}
            {providers.length > 0 && !editing && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>快速添加</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handleAdd(preset)}
                      style={{ height: 24, padding: '0 8px', fontSize: 10, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', transition: 'all 100ms' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent-text)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-tertiary)' }}
                    >
                      + {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* System Prompt */}
            <SystemPromptSection />
          </>)}

          {tab === 'cloud' && (
            <CloudTab
              cloudConfig={cloudConfig}
              setCloudConfig={setCloudConfig}
              cloudUser={cloudUser}
              setCloudUser={setCloudUser}
              inputStyle={inputStyle}
            />
          )}

          {tab === 'keys' && <KeyBindingsTab />}
        </div>
      </div>
      {/* Provider edit modal */}
      {editing && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
          onPointerDown={(e) => {
            providerOverlayPointerDownRef.current = e.target === e.currentTarget
          }}
          onClick={(e) => {
            if (providerOverlayPointerDownRef.current && e.target === e.currentTarget) setEditing(null)
            providerOverlayPointerDownRef.current = false
          }}
        >
          <div
            className="animate-scale-in"
            style={{ width: 440, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ height: 44, padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {providers.find((p) => p.id === editing.id) ? '编辑提供商' : '添加提供商'}
              </span>
              <button onClick={() => setEditing(null)} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div style={{ padding: '16px 18px 20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Preset selector */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, fontWeight: 500 }}>选择厂商</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PROVIDER_PRESETS.map((preset) => {
                    const isSelected = editing.name === preset.label || (editing.baseUrl === preset.baseUrl && editing.type === preset.type && preset.baseUrl !== '')
                    return (
                      <button
                        key={preset.label}
                        onClick={() => setEditing({ ...editing, name: preset.label, type: preset.type, baseUrl: preset.baseUrl, model: preset.model })}
                        style={{
                          height: 28, padding: '0 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', transition: 'all 100ms',
                          background: isSelected ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                          color: isSelected ? 'var(--accent-text)' : 'var(--text-secondary)',
                          border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                          fontWeight: isSelected ? 500 : 400,
                        }}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setEditing({ ...editing, name: editing.name || '自定义', type: 'custom', baseUrl: editing.baseUrl })}
                    style={{
                      height: 28, padding: '0 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', transition: 'all 100ms',
                      background: !PROVIDER_PRESETS.some((p) => p.label === editing.name) ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                      color: !PROVIDER_PRESETS.some((p) => p.label === editing.name) ? 'var(--accent-text)' : 'var(--text-secondary)',
                      border: !PROVIDER_PRESETS.some((p) => p.label === editing.name) ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                    }}
                  >
                    其他...
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>名称</label>
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    style={inputStyle} placeholder="My Provider"
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>协议类型</label>
                  <ModelSelect
                    value={{ openai: 'OpenAI', claude: 'Claude (Anthropic)', custom: 'OpenAI 兼容', ollama: 'Ollama (本地)', codex: 'Codex CLI' }[editing.type] || editing.type}
                    options={['OpenAI', 'OpenAI 兼容', 'Codex CLI', 'Claude (Anthropic)', 'Ollama (本地)']}
                    allowCustom={false}
                    placeholder="选择协议"
                    onChange={(val) => {
                      const typeMap: Record<string, ProviderConfig['type']> = { 'OpenAI': 'openai', 'Claude (Anthropic)': 'claude', 'OpenAI 兼容': 'custom', 'Ollama (本地)': 'ollama', 'Codex CLI': 'codex' }
                      const newType = typeMap[val] || 'custom'
                      setEditing({
                        ...editing,
                        type: newType,
                        apiKey: newType === 'codex' ? '' : editing.apiKey,
                        baseUrl: newType === 'codex' ? (editing.type === 'codex' ? editing.baseUrl || 'codex' : 'codex') : editing.baseUrl,
                        model: DEFAULT_MODELS[newType]?.[0] || editing.model
                      })
                    }}
                  />
                </div>
              </div>
              {editing.type !== 'codex' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>API Key</label>
                  <input type="password" value={editing.apiKey} onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    style={inputStyle} placeholder={editing.type === 'ollama' ? '无需填写' : 'sk-...'}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>{editing.type === 'codex' ? 'CLI 路径' : `Base URL ${editing.type === 'openai' || editing.type === 'claude' ? '(留空使用官方)' : ''}`}</label>
                <input value={editing.baseUrl} onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                  style={inputStyle} placeholder={editing.type === 'codex' ? 'codex 或 /usr/local/bin/codex' : editing.type === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.example.com/v1'}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>模型</label>
                <ModelSelect
                  value={editing.model}
                  options={getModelsForEditing(editing)}
                  placeholder="选择或输入模型"
                  onChange={(model) => setEditing({ ...editing, model })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setEditing(null)} style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}>取消</button>
                <button onClick={handleSave} style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={detectConfirm}
        title="自动检测 AI 配置"
        message="将读取本地 Claude Code / Codex 配置。Codex 的 ChatGPT 官方登录会添加为 Codex CLI 提供商。"
        confirmText="检测"
        onConfirm={async () => {
          setDetectConfirm(false)
          const detected = await window.api.invoke('ai:detect-local-config', undefined)
          let added = 0
          let existed = 0
          const updated = [...providers]
          if (detected.claude) {
            const exists = updated.find((p: any) => p.apiKey === detected.claude!.apiKey)
            if (!exists) {
              const hasCustomBase = !!detected.claude.baseUrl
              const np = {
                id: crypto.randomUUID(),
                name: hasCustomBase ? 'Claude 中转站 (本地检测)' : 'Claude (本地检测)',
                type: (hasCustomBase ? 'custom' : 'claude') as any,
                baseUrl: hasCustomBase ? detected.claude.baseUrl + '/v1' : '',
                apiKey: detected.claude.apiKey,
                model: 'claude-sonnet-4-6',
                enabled: true
              }
              updated.push(np)
              added++
            } else existed++
          }
          if (detected.openai) {
            const exists = updated.find((p: any) => p.apiKey === detected.openai!.apiKey)
            if (!exists) {
              const np = { id: crypto.randomUUID(), name: 'OpenAI (本地检测)', type: 'openai' as const, baseUrl: '', apiKey: detected.openai.apiKey, model: 'gpt-4.1-mini', enabled: true }
              updated.push(np)
              added++
            } else existed++
          }
          if (detected.codex) {
            const exists = updated.find((p: any) => p.type === 'codex' && (p.baseUrl || 'codex') === detected.codex!.command)
            if (!exists) {
              const np = { id: crypto.randomUUID(), name: 'Codex CLI (本地登录)', type: 'codex' as const, baseUrl: detected.codex.command, apiKey: '', model: 'gpt-5.4', enabled: true }
              updated.push(np)
              added++
            } else existed++
          }
          if (added > 0) {
            saveProviders(updated)
            toast(`已检测并添加 ${added} 个 AI 配置`, 'success')
          } else if (existed > 0) {
            toast('检测到的 AI 配置已存在', 'info')
          } else if (detected.skipped?.length) {
            toast(detected.skipped[0], 'info')
          } else {
            toast('未检测到本地 AI 配置，或已存在', 'info')
          }
        }}
        onCancel={() => setDetectConfirm(false)}
      />
    </div>
  )
}

interface CloudTabProps {
  cloudConfig: { supabaseUrl: string; supabaseKey: string; serviceRoleKey: string; enabled: boolean }
  setCloudConfig: (c: any) => void
  cloudUser: { email: string } | null
  setCloudUser: (u: any) => void
  inputStyle: React.CSSProperties
}

function CloudTab({ cloudConfig, setCloudConfig, cloudUser, setCloudUser, inputStyle }: CloudTabProps) {
  const [activeProvider, setActiveProvider] = useState<string>('supabase')
  const [providers, setProviders] = useState<{ type: string; name: string; configured: boolean }[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [onedriveConfig, setOnedriveConfig] = useState({ clientId: '', folder: '/Nexusky' })
  const [icloudPath, setIcloudPath] = useState<string | null>(null)

  useEffect(() => {
    window.api.invoke('cloud:get-sync-provider', undefined).then(setActiveProvider)
    window.api.invoke('cloud:get-all-providers', undefined).then(setProviders)
    window.api.invoke('cloud:get-onedrive-config', undefined).then((c) => {
      if (c) setOnedriveConfig({ clientId: c.clientId, folder: c.folder })
    })
    window.api.invoke('cloud:get-icloud-path', undefined).then(setIcloudPath)
  }, [])

  const switchProvider = async (type: string) => {
    setActiveProvider(type)
    await window.api.invoke('cloud:set-sync-provider', { provider: type })
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    const vaultPath = await window.api.invoke('vault:get', undefined)
    if (!vaultPath) { setSyncing(false); return }
    const result = await window.api.invoke('cloud:sync', { vaultPath })
    if (result.errors.length === 0 && result.conflicts.length === 0) {
      setSyncMsg(`同步完成: ${result.total} 个文件, 推送 ${result.pushed}, 拉取 ${result.pulled}`)
    } else if (result.conflicts.length > 0) {
      setSyncMsg(`同步完成，但有 ${result.conflicts.length} 个冲突文件（远端更新）: ${result.conflicts.map((c) => c.path).join(', ')}`)
    } else {
      setSyncMsg(`有 ${result.errors.length} 个错误: ${result.errors[0]}`)
    }
    setSyncing(false)
  }

  const handlePull = async () => {
    setSyncing(true)
    setSyncMsg('')
    const vaultPath = await window.api.invoke('vault:get', undefined)
    if (!vaultPath) { setSyncing(false); return }
    const result = await window.api.invoke('cloud:pull-all', { vaultPath })
    if (result.errors.length === 0) {
      setSyncMsg(`拉取完成: 共 ${result.total} 个远端文件, 拉取 ${result.pulled} 个`)
    } else {
      setSyncMsg(`有 ${result.errors.length} 个错误: ${result.errors[0]}`)
    }
    setSyncing(false)
  }

  const providerBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    height: 56,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 8,
    border: active ? '2px solid var(--accent)' : '1px solid var(--border-default)',
    background: active ? 'var(--accent-muted)' : 'var(--bg-elevated)',
    cursor: 'pointer',
    transition: 'all 150ms',
    fontSize: 11,
    fontWeight: 500,
    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Provider selector */}
      <div>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>同步后端</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => switchProvider('supabase')} style={providerBtnStyle(activeProvider === 'supabase')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            Supabase
          </button>
          <button onClick={() => switchProvider('icloud')} style={providerBtnStyle(activeProvider === 'icloud')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
            iCloud
          </button>
          <button onClick={() => switchProvider('onedrive')} style={providerBtnStyle(activeProvider === 'onedrive')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
            OneDrive
          </button>
        </div>
      </div>

      {/* Provider-specific config */}
      {activeProvider === 'supabase' && (
        <SupabaseConfig
          cloudConfig={cloudConfig}
          setCloudConfig={setCloudConfig}
          cloudUser={cloudUser}
          setCloudUser={setCloudUser}
          inputStyle={inputStyle}
        />
      )}

      {activeProvider === 'icloud' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              iCloud Drive 通过文件系统同步，无需额外配置。确保已登录 iCloud 并启用 iCloud Drive。
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              路径: {icloudPath || '未检测到 iCloud Drive'}
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>自定义 iCloud 同步路径（可选）</label>
            <input
              value={icloudPath || ''}
              onChange={(e) => setIcloudPath(e.target.value)}
              style={inputStyle}
              placeholder="~/Library/Mobile Documents/..."
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            />
            <button
              onClick={async () => { if (icloudPath) await window.api.invoke('cloud:set-icloud-path', { path: icloudPath }) }}
              style={{ marginTop: 8, height: 28, padding: '0 12px', fontSize: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}
            >
              保存路径
            </button>
          </div>
        </div>
      )}

      {activeProvider === 'onedrive' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>Application (Client) ID</label>
            <input
              value={onedriveConfig.clientId}
              onChange={(e) => setOnedriveConfig({ ...onedriveConfig, clientId: e.target.value })}
              style={inputStyle}
              placeholder="Azure AD 应用 Client ID"
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>同步文件夹</label>
            <input
              value={onedriveConfig.folder}
              onChange={(e) => setOnedriveConfig({ ...onedriveConfig, folder: e.target.value })}
              style={inputStyle}
              placeholder="/Nexusky"
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                await window.api.invoke('cloud:save-onedrive-config', onedriveConfig)
                const result = await window.api.invoke('cloud:onedrive-auth', { clientId: onedriveConfig.clientId })
                if (result.success) toast('OneDrive 授权成功', 'success')
                else toast(`授权失败: ${result.error}`, 'error')
              }}
              style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
            >
              授权登录
            </button>
            <button
              onClick={async () => { await window.api.invoke('cloud:save-onedrive-config', onedriveConfig) }}
              style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }}
            >
              保存配置
            </button>
          </div>
        </div>
      )}

      {/* Auto sync */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>自动同步</span>
        <select
          defaultValue={localStorage.getItem('nexusky-auto-sync') || '0'}
          onChange={(e) => localStorage.setItem('nexusky-auto-sync', e.target.value)}
          style={{ height: 30, padding: '0 10px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none' }}
        >
          <option value="0">关闭</option>
          <option value="5">每 5 分钟</option>
          <option value="10">每 10 分钟</option>
          <option value="30">每 30 分钟</option>
          <option value="60">每 60 分钟</option>
        </select>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>修改后重启应用生效</p>
      </div>

      {/* Sync actions */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>同步操作</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', fontWeight: 500, opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? '同步中...' : '双向同步'}
          </button>
          <button
            onClick={handlePull}
            disabled={syncing}
            style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1 }}
          >
            {syncing ? '拉取中...' : '从云端拉取'}
          </button>
        </div>
        {syncMsg && (
          <p style={{ marginTop: 10, fontSize: 11, color: syncMsg.includes('错误') ? '#f87171' : 'var(--text-tertiary)', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-base)' }}>
            {syncMsg}
          </p>
        )}
      </div>
    </div>
  )
}

function SupabaseConfig({ cloudConfig, setCloudConfig, cloudUser, setCloudUser, inputStyle }: CloudTabProps) {
  return (
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
        <label style={{ display: 'block', fontSize: 11, color: 'var(--accent-text)', marginBottom: 6, fontWeight: 600 }}>Service Role Key（必填）</label>
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
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>启用 Supabase</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
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
              toast(result.success ? '云端初始化成功！' : `初始化失败: ${result.error}`, result.success ? 'success' : 'error')
            }}
            style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }}
          >
            一键初始化
          </button>
        )}
      </div>
      {cloudConfig.enabled && cloudUser && (
        <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cloudUser.email}</span>
            <button
              onClick={async () => { await window.api.invoke('cloud:sign-out', undefined); setCloudUser(null) }}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              退出
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ThemeTab() {
  const { theme, setTheme } = useUIStore()

  const themes = [
    { id: 'dark' as const, label: '深色', icon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /> },
    { id: 'light' as const, label: '浅色', icon: <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></> },
    { id: 'ocean' as const, label: '深海蓝', icon: <><path d="M2 12c2-2 4-3 6-3s4 1 6 3 4 3 6 3 4-1 6-3" /><path d="M2 18c2-2 4-3 6-3s4 1 6 3 4 3 6 3 4-1 6-3" /></> },
    { id: 'amber' as const, label: '暖夜橙', icon: <><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2" /><circle cx="12" cy="12" r="4" /></> },
    { id: 'forest' as const, label: '森林绿', icon: <><path d="M12 2L7 10h10L12 2z" /><path d="M5 18h14" /><path d="M9 10l-4 8h14l-4-8" /><line x1="12" y1="18" x2="12" y2="22" /></> },
    { id: 'rose' as const, label: '玫瑰粉', icon: <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /> },
    { id: 'minimal' as const, label: '极简灰', icon: <rect x="3" y="3" width="18" height="18" rx="2" /> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>选择主题</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 12 }}>
        {themes.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTheme(id)}
            style={{
              height: 88,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              borderRadius: 10,
              border: theme === id ? '2px solid var(--accent)' : '1px solid var(--border-default)',
              background: theme === id ? 'var(--accent-muted)' : 'var(--bg-elevated)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: theme === id ? 'var(--accent-text)' : 'var(--text-tertiary)' }}>
              {icon}
            </svg>
            <span style={{ fontSize: 12, color: theme === id ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AppearanceTab() {
  const [appVersion, setAppVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null)
  const [updateStage, setUpdateStage] = useState<'idle' | 'checking' | 'downloading' | 'ready'>('idle')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const { theme, language, setLanguage } = useUIStore()

  useEffect(() => {
    window.api.invoke('app:get-version', undefined).then(setAppVersion)
  }, [])

  useEffect(() => {
    const offProgress = (window.api as any).onUpdaterProgress?.((data: { percent: number }) => {
      setDownloadPercent(Math.round(data.percent || 0))
      setUpdateStage('downloading')
    })
    const offDone = (window.api as any).onUpdaterDownloaded?.(() => {
      setUpdateStage('ready')
    })
    return () => { offProgress?.(); offDone?.() }
  }, [])

  if (showThemePicker) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowThemePicker(false)}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>选择主题</span>
        </div>
        <ThemeTab />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>主题</span>
        <button
          onClick={() => setShowThemePicker(true)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 140, padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          <span style={{ fontSize: 12 }}>{{ dark: '深色', light: '浅色', ocean: '深海蓝', amber: '暖夜橙', forest: '森林绿', rose: '玫瑰粉', minimal: '极简灰' }[theme]}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)' }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Language */}
      <div>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>语言 / Language</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['zh-CN', '简体中文'], ['en', 'English']] as const).map(([lang, label]) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              style={{
                padding: '8px 16px',
                fontSize: 12,
                borderRadius: 8,
                border: language === lang ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                background: language === lang ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                color: language === lang ? 'var(--accent)' : 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: language === lang ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Version & Update */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nexusky v{appVersion || '...'}</span>
          {updateInfo && updateStage === 'idle' && (
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>发现新版本 v{updateInfo.version}</span>
          )}
          {updateStage === 'downloading' && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>正在下载 {downloadPercent}%</span>
          )}
          {updateStage === 'ready' && (
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>更新已下载，重启即可安装</span>
          )}
        </div>
        {updateStage === 'idle' && !updateInfo && (
          <button
            onClick={async () => {
              setUpdateStage('checking')
              const result = await window.api.invoke('updater:check', undefined)
              if (result.available && result.version) {
                setUpdateInfo({ version: result.version })
                setUpdateStage('idle')
              } else {
                setUpdateStage('idle')
                toast('已是最新版本', 'success')
              }
            }}
            style={{ height: 26, padding: '0 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 5, color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            检查更新
          </button>
        )}
        {updateStage === 'checking' && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>检查中...</span>
        )}
        {updateStage === 'idle' && updateInfo && (
          <button
            onClick={async () => {
              if (window.api.platform === 'darwin') {
                await window.api.invoke('app:open-external', { url: 'https://github.com/wobushiyoushen0214/Nexusky/releases/latest' })
              } else {
                setUpdateStage('downloading')
                setDownloadPercent(0)
                try {
                  await window.api.invoke('updater:download', undefined)
                } catch (e: any) {
                  toast(`下载失败: ${e.message || ''}`, 'error')
                  setUpdateStage('idle')
                }
              }
            }}
            style={{ height: 26, padding: '0 10px', fontSize: 11, background: 'var(--accent)', border: 'none', borderRadius: 5, color: 'white', cursor: 'pointer' }}
          >
            {window.api.platform === 'darwin' ? '前往下载' : '立即更新'}
          </button>
        )}
        {updateStage === 'ready' && (
          <button
            onClick={() => window.api.invoke('updater:install', undefined)}
            style={{ height: 26, padding: '0 10px', fontSize: 11, background: 'var(--accent)', border: 'none', borderRadius: 5, color: 'white', cursor: 'pointer' }}
          >
            重启安装
          </button>
        )}
      </div>
    </div>
  )
}

function SystemPromptSection() {
  const [prompt, setPrompt] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.invoke('ai:get-system-prompt', undefined).then((p) => setPrompt(p || ''))
  }, [])

  const handleSave = async () => {
    await window.api.invoke('ai:set-system-prompt', { prompt })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>自定义系统提示词</span>
        <button
          onClick={handleSave}
          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: 'none', background: saved ? 'rgba(74,222,128,0.15)' : 'var(--accent)', color: saved ? '#4ade80' : '#fff', cursor: 'pointer', fontWeight: 500, transition: 'all 150ms' }}
        >
          {saved ? '已保存' : '保存'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>设置 AI 对话的默认系统提示词，留空使用内置默认提示词</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="例如：你是一个专注于编程的助手，回答简洁明了..."
        rows={4}
        style={{ width: '100%', padding: '8px 10px', fontSize: 12, lineHeight: 1.6, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
      />
    </div>
  )
}

function KeyBindingsTab() {
  const { bindings, setCustomKey, resetAll } = useKeyBindingStore()
  const [recording, setRecording] = useState<string | null>(null)

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault()
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) parts.push(key)
    if (parts.length > 1) {
      setCustomKey(id, parts.join('+'))
      setRecording(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>快捷键配置</span>
        <button onClick={resetAll} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>重置全部</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {bindings.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-base)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.label}</span>
            <button
              onClick={() => setRecording(b.id)}
              onKeyDown={(e) => recording === b.id && handleKeyDown(e, b.id)}
              onBlur={() => setRecording(null)}
              style={{
                minWidth: 100, height: 24, padding: '0 8px', fontSize: 11, textAlign: 'center',
                background: recording === b.id ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                border: recording === b.id ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none',
              }}
            >
              {recording === b.id ? '按下快捷键...' : (b.customKey || b.defaultKey)}
            </button>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>点击快捷键按钮后按下新组合键即可修改。修改后需重启应用生效。</p>
    </div>
  )
}

function ModelSelect({
  value,
  options,
  onChange,
  placeholder = '选择或输入',
  allowCustom = true
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
  allowCustom?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [activeIndex, setActiveIndex] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) setQuery(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, value])

  const handleOpen = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      const dropHeight = Math.min(Math.max(options.length, 1) * 30 + 8, 210)
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const top = spaceBelow >= dropHeight ? rect.bottom + 4 : rect.top - dropHeight - 4
      setPos({ top, left: rect.left, width: rect.width })
    }
    setQuery('')
    setOpen(true)
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter((opt) => opt.toLowerCase().includes(normalizedQuery))
    : options
  const exactMatch = options.some((opt) => opt.toLowerCase() === normalizedQuery)
  const canUseCustom = allowCustom && query.trim().length > 0 && !exactMatch

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const commitValue = (nextValue: string) => {
    const trimmed = nextValue.trim()
    if (!trimmed) return
    onChange(trimmed)
    setQuery(trimmed)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const selected = filteredOptions[activeIndex]
      if (selected && (!allowCustom || selected.toLowerCase() === normalizedQuery || !canUseCustom)) {
        commitValue(selected)
        return
      }
      if (canUseCustom) {
        commitValue(query)
        return
      }
      if (selected) commitValue(selected)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery(value)
    }
  }

  return (
    <div ref={ref}>
      <div
        style={{
          width: '100%', height: 32, padding: '0 12px', fontSize: 13,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 6, color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'border-color 150ms',
          borderColor: open ? 'var(--accent)' : undefined,
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={handleOpen}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            padding: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: 13,
          }}
        />
        <svg
          onMouseDown={(e) => { e.preventDefault(); open ? setOpen(false) : handleOpen() }}
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ flexShrink: 0, cursor: 'pointer', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          maxHeight: 200, overflowY: 'auto',
        }}>
          {filteredOptions.map((opt, index) => (
            <button
              key={opt}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commitValue(opt)}
              style={{
                width: '100%', height: 30, padding: '0 12px', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 8,
                background: opt === value ? 'var(--accent-muted)' : index === activeIndex ? 'var(--bg-hover)' : 'transparent',
                color: opt === value ? 'var(--accent-text)' : 'var(--text-primary)',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 80ms',
              }}
            >
              {opt === value && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
              <span style={{ marginLeft: opt === value ? 0 : 18 }}>{opt}</span>
            </button>
          ))}
          {canUseCustom && (
            <button
              onClick={() => commitValue(query)}
              style={{
                width: '100%', minHeight: 30, padding: '6px 12px', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 6,
                background: filteredOptions.length === 0 ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--accent-text)', border: 'none', borderTop: filteredOptions.length > 0 ? '1px solid var(--border-subtle)' : 'none',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              使用 “{query.trim()}”
            </button>
          )}
          {filteredOptions.length === 0 && !canUseCustom && (
            <div style={{ height: 30, padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>
              未找到匹配项
            </div>
          )}
        </div>
      )}
    </div>
  )
}
