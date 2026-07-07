import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/ui-store'
import { useEditorStore } from '../stores/editor-store'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import { queueAiCommandDraft, type AICommandDraft } from './ai/ai-command-draft'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from './ui/command'

type CommandCategory = 'file' | 'search' | 'ai' | 'graph' | 'export' | 'interface'

interface PaletteCommand {
  id: string
  label: string
  category: CommandCategory
  description?: string
  shortcut?: string
  keywords?: string[]
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const { setRightPanel, setSearchOpen, setSettingsOpen, openFilesSidebar, toggleSidebar, toggleTheme, toggleFocusMode, setMainView, resetWorkspaceLayout } = useUIStore()
  const { saveFile, currentFilePath, content } = useEditorStore()
  const { vaultPath } = useVaultStore()

  const queueAiDraft = useCallback((draft: AICommandDraft) => {
    queueAiCommandDraft(draft, () => setRightPanel('chat'))
  }, [setRightPanel])

  const getCurrentNoteTitle = useCallback(() => {
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const fallback = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') || ''
    return (heading || fallback).replace(/[\[\]]/g, '').trim()
  }, [content, currentFilePath])

  const requireCurrentNote = useCallback(() => {
    if (currentFilePath) return true
    toast(t('commandPalette.toasts.openNoteFirst'), 'info')
    return false
  }, [currentFilePath, t])

  const commands: PaletteCommand[] = useMemo(() => [
    { id: 'save', category: 'file', label: t('commandPalette.commands.save.label'), shortcut: 'Ctrl+S', keywords: ['save'], action: () => saveFile() },
    { id: 'new-note', category: 'file', label: t('commandPalette.commands.newNote.label'), shortcut: 'Ctrl+N', keywords: ['new', 'note'], action: () => window.dispatchEvent(new CustomEvent('create-new-note')) },
    { id: 'copy-wikilink', category: 'file', label: t('commandPalette.commands.copyWikilink.label'), description: t('commandPalette.commands.copyWikilink.description'), keywords: ['wikilink', 'copy', 'obsidian'], action: async () => {
      const title = getCurrentNoteTitle()
      const { toast } = await import('../stores/toast-store')
      if (!title) {
        toast(t('commandPalette.toasts.openNoteFirst'), 'info')
        return
      }
      await navigator.clipboard.writeText(`[[${title}]]`)
      toast(t('commandPalette.toasts.wikilinkCopied'), 'success')
    }},
    { id: 'trash', category: 'file', label: t('commandPalette.commands.trash.label'), keywords: ['trash'], action: () => window.dispatchEvent(new CustomEvent('open-trash')) },
    { id: 'import-obsidian', category: 'file', label: t('commandPalette.commands.importObsidian.label'), description: t('commandPalette.commands.importObsidian.description'), keywords: ['obsidian', 'vault', 'import'], action: async () => {
      if (!vaultPath) return
      const result = await window.api.invoke('file:import-obsidian', { vaultPath })
      if (result.canceled) return
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.importDone', { imported: result.imported, converted: result.converted }), 'success')
      useVaultStore.getState().refreshFiles()
    }},
    { id: 'search', category: 'search', label: t('commandPalette.commands.search.label'), shortcut: 'Ctrl+Shift+F', keywords: ['find', 'search'], action: () => setSearchOpen(true) },
    { id: 'chat', category: 'ai', label: t('commandPalette.commands.chat.label'), shortcut: 'Ctrl+L', description: t('commandPalette.commands.chat.description'), keywords: ['chat', 'agent'], action: () => setRightPanel('chat') },
    { id: 'ai-rag', category: 'ai', label: t('commandPalette.commands.aiRag.label'), description: t('commandPalette.commands.aiRag.description'), keywords: ['rag', 'ask', 'sources'], action: () => queueAiDraft({ mode: 'chat', agentMode: false, prompt: t('commandPalette.prompts.rag') }) },
    { id: 'ai-edit-current', category: 'ai', label: t('commandPalette.commands.aiEditCurrent.label'), description: t('commandPalette.commands.aiEditCurrent.description'), keywords: ['edit', 'rewrite'], action: () => { if (requireCurrentNote()) queueAiDraft({ mode: 'edit', requiresCurrentNote: true, prompt: t('commandPalette.prompts.editCurrent') }) } },
    { id: 'ai-rewrite-selection', category: 'ai', label: t('commandPalette.commands.aiRewriteSelection.label'), description: t('commandPalette.commands.aiRewriteSelection.description'), keywords: ['selection', 'rewrite'], action: () => queueAiDraft({ mode: 'edit', attachSelection: true, prompt: t('commandPalette.prompts.rewriteSelection') }) },
    { id: 'ai-new-note', category: 'ai', label: t('commandPalette.commands.aiNewNote.label'), description: t('commandPalette.commands.aiNewNote.description'), keywords: ['generate', 'create'], action: () => queueAiDraft({ mode: 'edit', unboundEdit: true, prompt: t('commandPalette.prompts.newNote') }) },
    { id: 'graph-full', category: 'graph', label: t('commandPalette.commands.graphFull.label'), shortcut: 'Ctrl+G', keywords: ['graph'], action: () => {
      setMainView('graph')
    }},
    { id: 'export-pdf', category: 'export', label: t('commandPalette.commands.exportPdf.label'), keywords: ['pdf'], action: async () => {
      const filePath = currentFilePath
      if (!requireCurrentNote() || !filePath || !content) return
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.exportingPdf'), 'info')
      const title = filePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:pdf', { content, title })
      toast(t('commandPalette.toasts.pdfDone'), 'success')
    }},
    { id: 'export-html', category: 'export', label: t('commandPalette.commands.exportHtml.label'), keywords: ['html'], action: async () => {
      const filePath = currentFilePath
      if (!requireCurrentNote() || !filePath || !content) return
      const { toast } = await import('../stores/toast-store')
      const title = filePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:html', { content, title })
      toast(t('commandPalette.toasts.htmlDone'), 'success')
    }},
    { id: 'outline', category: 'interface', label: t('commandPalette.commands.outline.label'), shortcut: 'Ctrl+E', keywords: ['outline'], action: () => { if (requireCurrentNote()) setRightPanel('outline') } },
    { id: 'properties', category: 'interface', label: t('commandPalette.commands.properties.label'), description: t('commandPalette.commands.properties.description'), keywords: ['properties', 'frontmatter', 'obsidian'], action: () => { if (requireCurrentNote()) setRightPanel('properties') } },
    { id: 'settings', category: 'interface', label: t('commandPalette.commands.settings.label'), shortcut: 'Ctrl+,', keywords: ['settings'], action: () => setSettingsOpen(true) },
    { id: 'new-window', category: 'interface', label: t('commandPalette.commands.newWindow.label'), description: t('commandPalette.commands.newWindow.description'), keywords: ['window', 'multi'], action: () => window.api.windowControls.newWindow() },
    { id: 'sidebar', category: 'interface', label: t('commandPalette.commands.sidebar.label'), shortcut: 'Ctrl+Shift+B', keywords: ['sidebar'], action: () => {
      const state = useUIStore.getState()
      if (state.mainView === 'editor' && !state.sidebarCollapsed) toggleSidebar()
      else openFilesSidebar()
    } },
    { id: 'reset-workspace', category: 'interface', label: t('commandPalette.commands.resetWorkspace.label'), description: t('commandPalette.commands.resetWorkspace.description'), keywords: ['workspace', 'layout', 'reset'], action: () => resetWorkspaceLayout() },
    { id: 'focus', category: 'interface', label: t('commandPalette.commands.focus.label'), shortcut: 'F11', keywords: ['focus'], action: () => toggleFocusMode() },
    { id: 'theme', category: 'interface', label: t('commandPalette.commands.theme.label'), keywords: ['theme'], action: () => toggleTheme() },
  ], [saveFile, currentFilePath, content, vaultPath, setRightPanel, setSearchOpen, setSettingsOpen, openFilesSidebar, toggleSidebar, toggleTheme, toggleFocusMode, setMainView, resetWorkspaceLayout, queueAiDraft, getCurrentNoteTitle, requireCurrentNote, t])

  const filtered = query.trim()
    ? commands.filter((c) => {
      const q = query.toLowerCase()
      return [c.label, c.category, c.description, c.id, ...(c.keywords || [])].some((part) => part?.toLowerCase().includes(q))
    })
    : commands

  const grouped = filtered.reduce<Record<string, PaletteCommand[]>>((acc, command) => {
    if (!acc[command.category]) acc[command.category] = []
    acc[command.category].push(command)
    return acc
  }, {})

  const categoryOrder: CommandCategory[] = ['ai', 'graph', 'search', 'file', 'export', 'interface']

  useEffect(() => {
    if (open) {
      setQuery('')
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className="command-surface-dialog command-palette-dialog"
        overlayClassName="command-surface-overlay"
        showCloseButton={false}
      >
        <DialogTitle className="ui-sr-only">
          {t('commandPalette.title', { defaultValue: 'Command Palette' })}
        </DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('commandPalette.placeholder')}
          />
          <CommandList className="command-palette-list">
            <CommandEmpty>{t('commandPalette.empty')}</CommandEmpty>
            {categoryOrder.filter((category) => grouped[category]?.length).map((category) => (
              <CommandGroup key={category} heading={t(`commandPalette.categories.${category}`)}>
                {grouped[category].map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={cmd.id}
                    onSelect={() => {
                      cmd.action()
                      onClose()
                    }}
                  >
                    <span className="command-surface-item-main">
                      <span className="command-surface-item-title">{cmd.label}</span>
                      {cmd.description && (
                        <span className="command-surface-item-description">{cmd.description}</span>
                      )}
                    </span>
                    {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
