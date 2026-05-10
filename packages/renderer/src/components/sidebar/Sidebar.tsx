import { useEffect, useState } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { FileTree } from './FileTree'

export function Sidebar() {
  const { vaultPath, files, refreshFiles, selectVault } = useVaultStore()
  const openFile = useEditorStore((s) => s.openFile)
  const [isCreating, setIsCreating] = useState(false)
  const [newFileName, setNewFileName] = useState('')

  useEffect(() => {
    if (vaultPath) refreshFiles()
  }, [vaultPath])

  const handleCreateFile = async () => {
    if (!newFileName.trim() || !vaultPath) return
    const name = newFileName.trim().endsWith('.md') ? newFileName.trim() : `${newFileName.trim()}.md`
    const path = `${vaultPath}/${name}`
    await window.api.invoke('file:create', { path, content: `# ${newFileName.trim().replace(/\.md$/, '')}\n\n` })
    setIsCreating(false)
    setNewFileName('')
    await refreshFiles()
    await openFile(path)
  }

  return (
    <aside style={{ width: 240 }} className="h-full bg-[var(--sidebar-bg)] flex flex-col border-r border-[var(--border-subtle)]">
      {/* Header */}
      <div style={{ height: 44, padding: '0 16px' }} className="flex items-center justify-between shrink-0">
        <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
          {vaultPath?.split(/[\\/]/).pop()}
        </span>
        <div className="flex items-center">
          <button
            onClick={() => setIsCreating(true)}
            style={{ width: 28, height: 28 }}
            className="flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="新建笔记"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* New file input */}
      {isCreating && (
        <div style={{ padding: '0 12px 8px' }}>
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFile()
              if (e.key === 'Escape') { setIsCreating(false); setNewFileName('') }
            }}
            onBlur={() => { setIsCreating(false); setNewFileName('') }}
            placeholder="文件名"
            style={{ height: 28, padding: '0 8px', fontSize: 13 }}
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      )}

      {/* File tree */}
      <div style={{ padding: '0 12px 12px' }} className="flex-1 overflow-y-auto">
        <FileTree entries={files} />
      </div>

      {/* Footer */}
      <div style={{ height: 40, padding: '0 16px' }} className="flex items-center justify-between border-t border-[var(--border-subtle)] shrink-0">
        <button
          onClick={async () => {
            if (!vaultPath) return
            const path = await window.api.invoke('template:daily-note', { vaultPath })
            if (path) { await refreshFiles(); await openFile(path) }
          }}
          className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          title="今日笔记"
        >
          今日笔记
        </button>
        <button
          onClick={selectVault}
          className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          切换
        </button>
      </div>
    </aside>
  )
}
