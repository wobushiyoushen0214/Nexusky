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
    <div className="flex-1 flex flex-col items-center justify-center"
      style={{ background: 'var(--bg-base)', gap: 32 }}>

      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Nexusky
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          AI 驱动的知识库
        </p>
      </div>

      {isCreating ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
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
              height: 36, padding: '0 12px', fontSize: 14, borderRadius: 6,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none'
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreate}
              style={{
                flex: 1, height: 36, fontSize: 13, borderRadius: 6,
                background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer'
              }}
            >
              选择位置并创建
            </button>
            <button
              onClick={() => { setIsCreating(false); setVaultName('') }}
              style={{
                height: 36, padding: '0 16px', fontSize: 13, borderRadius: 6,
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)', cursor: 'pointer'
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
          <button
            onClick={() => setIsCreating(true)}
            style={{
              height: 38, fontSize: 14, borderRadius: 6,
              background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer'
            }}
          >
            创建笔记空间
          </button>
          <button
            onClick={selectVault}
            style={{
              height: 38, fontSize: 14, borderRadius: 6,
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)', cursor: 'pointer'
            }}
          >
            打开已有文件夹
          </button>
        </div>
      )}
    </div>
  )
}
