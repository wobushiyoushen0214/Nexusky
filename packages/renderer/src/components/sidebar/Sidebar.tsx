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
    <aside className="w-[220px] h-full bg-[var(--sidebar-bg)] flex flex-col border-r border-[var(--border-subtle)]">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between shrink-0">
        <span className="text-[12px] font-medium text-[var(--text-secondary)] truncate">
          {vaultPath?.split(/[\\/]/).pop()}
        </span>
        <div className="flex items-center">
          <button
            onClick={() => setIsCreating(true)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="新建笔记"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* New file input */}
      {isCreating && (
        <div className="px-2 pb-2">
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
            className="w-full h-7 px-2 text-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <FileTree entries={files} />
      </div>

      {/* Footer */}
      <div className="h-9 px-3 flex items-center border-t border-[var(--border-subtle)] shrink-0">
        <button
          onClick={selectVault}
          className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          切换笔记库
        </button>
      </div>
    </aside>
  )
}
