import { useState, useEffect } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import { ConfirmModal } from './ConfirmModal'
import type { TrashEntry } from '@shared/types/ipc'

interface TrashPanelProps {
  open: boolean
  onClose: () => void
}

export function getTrashReasonLabel(reason?: string): string | null {
  if (reason === 'sync_remote_delete') return '同步删除'
  return null
}

export function TrashPanel({ open, onClose }: TrashPanelProps) {
  const [items, setItems] = useState<TrashEntry[]>([])
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const refreshFiles = useVaultStore((s) => s.refreshFiles)

  useEffect(() => {
    if (open && vaultPath) {
      window.api.invoke('file:list-trash', { vaultPath }).then(setItems)
    }
  }, [open, vaultPath])

  const handleRestore = async (item: TrashEntry) => {
    if (!vaultPath) return
    await window.api.invoke('file:restore-trash', { trashPath: item.path, vaultPath })
    setItems((prev) => prev.filter((i) => i.path !== item.path))
    await refreshFiles()
    toast(`已恢复: ${item.originalName}`, 'success')
  }

  const handleEmptyTrash = async () => {
    if (!vaultPath) return
    await window.api.invoke('file:empty-trash', { vaultPath })
    setItems([])
    setEmptyConfirmOpen(false)
    toast('回收站已清空', 'info')
  }

  if (!open) return null

  return (
    <>
      <div
        className="animate-overlay-in"
        style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      >
        <div
          className="animate-scale-in"
          style={{ width: 440, maxHeight: '60vh', background: 'var(--bg-elevated)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>回收站</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {items.length > 0 && (
                <button onClick={() => setEmptyConfirmOpen(true)} style={{ fontSize: 11, color: '#f87171', background: 'transparent', border: 'none', cursor: 'pointer' }}>清空</button>
              )}
              <button onClick={onClose} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>关闭</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {items.length === 0 ? (
              <p style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>回收站为空</p>
            ) : (
              items.map((item) => (
                <div key={item.path} style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.originalName}</span>
                      {getTrashReasonLabel(item.reason) && (
                        <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>{getTrashReasonLabel(item.reason)}</span>
                      )}
                    </span>
                    {item.originalPath && (
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.originalPath}</span>
                    )}
                  </span>
                  <button onClick={() => handleRestore(item)} style={{ fontSize: 10, color: '#4ade80', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>恢复</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <ConfirmModal
        open={emptyConfirmOpen}
        title="清空回收站"
        message={`确定永久清空回收站中的 ${items.length} 个文件？此操作无法撤销。`}
        confirmText="清空"
        danger
        onConfirm={handleEmptyTrash}
        onCancel={() => setEmptyConfirmOpen(false)}
      />
    </>
  )
}
