import { useEffect } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { FileTree } from './FileTree'

export function Sidebar() {
  const { vaultPath, files, refreshFiles, selectVault } = useVaultStore()

  useEffect(() => {
    if (vaultPath) {
      refreshFiles()
    }
  }, [vaultPath])

  return (
    <aside className="w-64 h-full bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col">
      <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-sm font-medium truncate">
          {vaultPath?.split(/[\\/]/).pop() || '笔记库'}
        </span>
        <button
          onClick={selectVault}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          title="切换笔记库"
        >
          切换
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <FileTree entries={files} />
      </div>
    </aside>
  )
}
