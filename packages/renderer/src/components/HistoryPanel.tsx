import { useState, useEffect } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { toast } from '../stores/toast-store'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Empty, EmptyHeader, EmptyTitle } from './ui/empty'
import { ScrollArea } from './ui/scroll-area'
import './history-panel.css'

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
    window.dispatchEvent(new CustomEvent('editor-reload-content', { detail: { content } }))
    toast('已恢复到该版本', 'success')
    setPreview(null)
  }

  const handlePreview = async (snapshot: Snapshot) => {
    const content = await window.api.invoke('file:read', { path: snapshot.path })
    setPreview(content)
  }

  if (!currentFilePath) {
    return (
      <div className="history-panel history-panel--empty">
        <Empty className="history-panel__empty">
          <EmptyHeader>
            <EmptyTitle>请先打开一个文件</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="history-panel">
      {preview ? (
        <div className="history-panel__preview">
          <div className="history-panel__header">
            <span className="history-panel__eyebrow">预览</span>
            <Button type="button" variant="ghost" size="xs" className="history-panel__action" onClick={() => setPreview(null)}>
              返回列表
            </Button>
          </div>
          <ScrollArea className="history-panel__preview-scroll">
            <div className="history-panel__preview-content">{preview}</div>
          </ScrollArea>
        </div>
      ) : (
        <>
          <Badge variant="secondary" className="history-panel__count">
            {snapshots.length} 个历史版本
          </Badge>
          <ScrollArea className="history-panel__list">
            {snapshots.length === 0 && (
              <Empty className="history-panel__empty">
                <EmptyHeader>
                  <EmptyTitle>暂无历史版本（保存后自动创建）</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
            {snapshots.map((s) => (
              <Card asChild key={s.fileName} className="history-panel__snapshot">
                <article>
                  <CardHeader className="history-panel__snapshot-header">
                    <CardTitle asChild className="history-panel__snapshot-time">
                      <time dateTime={s.timestamp}>{s.timestamp.slice(0, 16).replace('T', ' ')}</time>
                    </CardTitle>
                  </CardHeader>
                  <CardFooter className="history-panel__snapshot-actions">
                    <Button type="button" variant="ghost" size="xs" className="history-panel__action" onClick={() => void handlePreview(s)}>
                      预览
                    </Button>
                    <Button type="button" variant="ghost" size="xs" className="history-panel__action history-panel__action--success" onClick={() => void handleRestore(s)}>
                      恢复
                    </Button>
                  </CardFooter>
                </article>
              </Card>
            ))}
          </ScrollArea>
        </>
      )}
    </div>
  )
}
