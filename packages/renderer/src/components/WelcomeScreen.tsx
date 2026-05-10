import { useState } from 'react'
import { useVaultStore } from '../stores/vault-store'

export function WelcomeScreen() {
  const { selectVault, createVault } = useVaultStore()
  const [isCreating, setIsCreating] = useState(false)
  const [vaultName, setVaultName] = useState('')

  const handleCreate = async () => {
    const name = vaultName.trim()
    if (!name) return
    await createVault(name)
    setIsCreating(false)
    setVaultName('')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
            <path d="M12 3L2 7l10 4 10-4-10-4z" fill="currentColor" opacity="0.9" />
            <path d="M2 17l10 4 10-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
            <path d="M2 12l10 4 10-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.02em' }}>
          Nexusky
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          AI 驱动的知识库
        </p>
      </div>

      {isCreating ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
          <input
            autoFocus
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setIsCreating(false); setVaultName('') }
            }}
            placeholder="输入笔记空间名称"
            style={{
              height: 36,
              padding: '0 12px',
              fontSize: 13,
              borderRadius: 8,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border-color 150ms',
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreate}
              style={{
                flex: 1, height: 36, fontSize: 13, borderRadius: 8,
                background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              选择位置并创建
            </button>
            <button
              onClick={() => { setIsCreating(false); setVaultName('') }}
              style={{
                height: 36, padding: '0 14px', fontSize: 13, borderRadius: 8,
                background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)', cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 200 }}>
          <button
            onClick={() => setIsCreating(true)}
            style={{
              height: 38, fontSize: 13, borderRadius: 8, fontWeight: 500,
              background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            创建笔记空间
          </button>
          <button
            onClick={selectVault}
            style={{
              height: 38, fontSize: 13, borderRadius: 8,
              background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)', cursor: 'pointer',
            }}
          >
            打开已有文件夹
          </button>
        </div>
      )}
    </div>
  )
}
