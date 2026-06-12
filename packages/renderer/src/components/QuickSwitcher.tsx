import { useState, useEffect } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command'
import type { NoteSearchResult } from '@shared/types/ipc'

interface QuickSwitcherProps {
  open: boolean
  onClose: () => void
}

export function QuickSwitcher({ open, onClose }: QuickSwitcherProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NoteSearchResult[]>([])
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  useEffect(() => {
    if (!vaultPath || !open) return
    if (!query.trim()) {
      window.api.invoke('db:get-recent-notes', { vaultPath, limit: 50 }).then((notes) => {
        const recent = useEditorStore.getState().recentFiles
        const sorted = [...notes].sort((a, b) => {
          const aIdx = recent.indexOf(`${vaultPath}/${a.filePath}`)
          const bIdx = recent.indexOf(`${vaultPath}/${b.filePath}`)
          if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
          if (aIdx >= 0) return -1
          if (bIdx >= 0) return 1
          return 0
        })
        setResults(sorted)
      })
      return
    }
    const timer = setTimeout(() => {
      window.api.invoke('db:search-notes', { vaultPath, query: query.trim() }).then(setResults)
    }, 150)
    return () => clearTimeout(timer)
  }, [query, vaultPath, open])

  const handleSelect = (result: NoteSearchResult) => {
    if (!vaultPath) return
    const fullPath = `${vaultPath}/${result.filePath}`
    openFile(fullPath)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className="command-surface-dialog quick-switcher-dialog"
        overlayClassName="command-surface-overlay"
        showCloseButton={false}
      >
        <DialogTitle className="ui-sr-only">Quick switcher</DialogTitle>
        <Command className="quick-switcher-input" shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="搜索笔记..."
          />
          <CommandList className="quick-switcher-list">
            <CommandEmpty>{query ? '没有找到匹配的笔记' : '暂无笔记'}</CommandEmpty>
            {results.length > 0 && (
              <CommandGroup>
                {results.map((result) => (
                  <CommandItem
                    value={result.id}
                    key={result.id}
                    onSelect={() => handleSelect(result)}
                  >
                    <span className="command-surface-item-main">
                      <span className="command-surface-item-title">{result.title}</span>
                      {result.aliasMatch ? (
                        <span className="command-surface-item-description">别名: {result.aliasMatch}</span>
                      ) : null}
                    </span>
                    <span className="quick-switcher-path">
                      {result.filePath.replace(/[^\\/]+$/, '').replace(/[\\/]$/, '') || '/'}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
