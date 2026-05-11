import { useState, useEffect } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { toast } from '../stores/toast-store'

interface Snapshot {
  fileName: string
  path: string
  timestamp: string
}

export function HistoryPanel() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)

  useEffect(() => {
    if (!vaultPath || !currentFilePath) { setSnapshots([]); return }
    window.api.invoke('file:get-history', { vaultPath, filePath: currentFilePath }).then(setSnapshots)
  }, [vaultPath, currentFilePath])

  const handleRestore = async (snapshot: Snapshot) => {
    if (!currentFilePath) return
    await window.api.invoke('file:restore-history', { snapshotPath: snapshot.path, targetPath: currentFilePath })
    const content = await window.api.invoke('file:read', { path: currentFilePath })
    const store = useEditorStore.getState()
    const tabIndex = store.tabs.findIndex((t) => t.path === currentFilePath)
    if (tabIndex >= 0) {
      const tabs = [...store.tabs]
      tabs[tabIndex] = { ...tabs[tabIndex], content, isDirty: false }
      useEditorStore.setState({ tabs, content, isDirty: false })
    }
    toast('已恢复到该版本', 'success')
    setPreview(null)
  }

  const handlePreview = async (snapshot: Snapshot) => {
    const content = await window.api.invoke('file:read', { path: snapshot.path })
    setPreview(content)
  }

  if (!currentFilePath) {
    return <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>请先打开一个文件</div>
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 0' }}>
      {preview ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>预览</span>
            <button onClick={() => setPreview(null)} style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>返回列表</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px', fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
            {preview}
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '0 12px 8px', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {snapshots.length} 个历史版本
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
            {snapshots.length === 0 && (
              <p style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>暂无历史版本（保存后自动创建）</p>
            )}
            {snapshots.map((s) => (
              <div key={s.fileName} style={{ padding: '8px 10px', borderRadius: 6, marginBottom: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>{s.timestamp.slice(0, 16).replace('T', ' ')}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button onClick={() => handlePreview(s)} style={{ fontSize: 10, color: 'var(--accent-text)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>预览</button>
                  <button onClick={() => handleRestore(s)} style={{ fontSize: 10, color: '#4ade80', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>恢复</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
