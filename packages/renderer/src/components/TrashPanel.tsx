import { useState, useEffect } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import { ConfirmModal } from './ConfirmModal'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
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

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="animate-scale-in glass-popover"
          style={{ width: 440, maxHeight: '60vh', background: 'var(--bg-glass-dense, var(--bg-glass-solid))', border: '1px solid var(--glass-panel-border)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-popover), var(--glass-panel-edge-shadow)', backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)', WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)' }}
        >
          <DialogHeader className="glass-divider-bottom" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0', background: 'var(--panel-bg-soft)', boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--glass-divider-shadow-bottom)' }}>
            <DialogTitle style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>回收站</DialogTitle>
            <div style={{ display: 'flex', gap: 8 }}>
              {items.length > 0 && (
                <Button type="button" variant="destructive" size="xs" onClick={() => setEmptyConfirmOpen(true)}>清空</Button>
              )}
              <Button type="button" variant="ghost" size="xs" onClick={onClose}>关闭</Button>
            </div>
          </DialogHeader>
          <ScrollArea style={{ flex: 1, minHeight: 0 }}>
            <div style={{ padding: 8 }}>
            {items.length === 0 ? (
              <p style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>回收站为空</p>
            ) : (
              items.map((item) => (
                <div key={item.path} style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--control-bg)', border: '1px solid var(--control-border)', boxShadow: 'inset 0 1px 0 var(--glass-highlight)' }}>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.originalName}</span>
                      {getTrashReasonLabel(item.reason) && (
                        <Badge variant="secondary" style={{ flexShrink: 0 }}>{getTrashReasonLabel(item.reason)}</Badge>
                      )}
                    </span>
                    {item.originalPath && (
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.originalPath}</span>
                    )}
                  </span>
                  <Button type="button" variant="outline" size="xs" onClick={() => handleRestore(item)} style={{ flexShrink: 0 }}>恢复</Button>
                </div>
              ))
            )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
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
