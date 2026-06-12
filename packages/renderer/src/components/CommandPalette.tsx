import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/ui-store'
import { useEditorStore } from '../stores/editor-store'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import { queueAiCommandDraft, type AICommandDraft } from './ai/ai-command-draft'
import { toolSurfaceCategoryToCommandCategory } from './tool-surface/tool-surface-category'
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
import type { LocalPlugin, PluginPanel, ToolSurfaceEntry } from '@shared/types/ipc'

type CommandCategory = 'file' | 'search' | 'ai' | 'plugin' | 'graph' | 'sync' | 'export' | 'interface'

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
  const [plugins, setPlugins] = useState<LocalPlugin[]>([])
  const [toolSurfaceEntries, setToolSurfaceEntries] = useState<ToolSurfaceEntry[]>([])
  const { setRightPanel, setSearchOpen, setSettingsOpen, openFilesSidebar, toggleSidebar, toggleTheme, toggleFocusMode, setMainView, resetWorkspaceLayout, setPublishScopeOpen, language } = useUIStore()
  const { saveFile, currentFilePath, content } = useEditorStore()
  const { vaultPath } = useVaultStore()

  const queueAiDraft = useCallback((draft: AICommandDraft) => {
    queueAiCommandDraft(draft, () => setRightPanel('chat'))
  }, [setRightPanel])

  const openPluginPanel = useCallback((plugin: LocalPlugin, panel: PluginPanel) => {
    window.dispatchEvent(new CustomEvent('plugin-panel-open', { detail: { plugin, panel } }))
    setRightPanel('plugin')
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
    { id: 'template-local-pack', category: 'file', label: t('commandPalette.commands.templateLocalPack.label'), description: t('commandPalette.commands.templateLocalPack.description'), keywords: ['template', 'local', 'featured', 'pack'], action: async () => {
      const result = await window.api.invoke('template:install-local-pack-bundle', undefined)
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.templatesInstalled', { count: result.installed }), result.installed > 0 ? 'success' : 'info')
    }},
    { id: 'template-community-pack', category: 'file', label: t('commandPalette.commands.templateCommunityPack.label'), description: t('commandPalette.commands.templateCommunityPack.description'), keywords: ['template', 'community', 'json'], action: async () => {
      if (!vaultPath) return
      const result = await window.api.invoke('template:install-community-pack', { vaultPath })
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.communityTemplatesInstalled', { count: result.installed }), result.installed > 0 ? 'success' : 'info')
    }},
    { id: 'template-community-folder', category: 'file', label: t('commandPalette.commands.templateCommunityFolder.label'), description: t('commandPalette.commands.templateCommunityFolder.description'), keywords: ['template', 'community', 'folder'], action: async () => {
      if (!vaultPath) return
      await window.api.invoke('template:list-community', { vaultPath })
      await window.api.invoke('file:reveal', { path: `${vaultPath}/.nexusky/templates` })
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
    { id: 'import-readwise', category: 'file', label: t('commandPalette.commands.importReadwise.label'), description: t('commandPalette.commands.importReadwise.description'), keywords: ['readwise', 'reader', 'highlight', 'import'], action: async () => {
      if (!vaultPath) return
      const result = await window.api.invoke('file:import-readwise', { vaultPath })
      if (result.canceled) return
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.readwiseImported', { imported: result.imported }), result.imported > 0 ? 'success' : 'info')
      useVaultStore.getState().refreshFiles()
    }},
    { id: 'import-pocket', category: 'file', label: t('commandPalette.commands.importPocket.label'), description: t('commandPalette.commands.importPocket.description'), keywords: ['pocket', 'read later', 'bookmark', 'import'], action: async () => {
      if (!vaultPath) return
      const result = await window.api.invoke('file:import-pocket', { vaultPath })
      if (result.canceled) return
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.pocketImported', { imported: result.imported }), result.imported > 0 ? 'success' : 'info')
      useVaultStore.getState().refreshFiles()
    }},
    { id: 'import-notion', category: 'file', label: t('commandPalette.commands.importNotion.label'), description: t('commandPalette.commands.importNotion.description'), keywords: ['notion', 'markdown', 'csv', 'import'], action: async () => {
      if (!vaultPath) return
      const result = await window.api.invoke('file:import-notion', { vaultPath })
      if (result.canceled) return
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.notionImported', { imported: result.imported, assets: result.assets }), result.imported > 0 ? 'success' : 'info')
      useVaultStore.getState().refreshFiles()
    }},
    { id: 'search', category: 'search', label: t('commandPalette.commands.search.label'), shortcut: 'Ctrl+Shift+F', keywords: ['find', 'search'], action: () => setSearchOpen(true) },
    { id: 'chat', category: 'ai', label: t('commandPalette.commands.chat.label'), shortcut: 'Ctrl+L', description: t('commandPalette.commands.chat.description'), keywords: ['chat', 'agent'], action: () => setRightPanel('chat') },
    { id: 'ai-rag', category: 'ai', label: t('commandPalette.commands.aiRag.label'), description: t('commandPalette.commands.aiRag.description'), keywords: ['rag', 'ask', 'sources'], action: () => queueAiDraft({ mode: 'chat', agentMode: false, prompt: t('commandPalette.prompts.rag') }) },
    { id: 'ai-edit-current', category: 'ai', label: t('commandPalette.commands.aiEditCurrent.label'), description: t('commandPalette.commands.aiEditCurrent.description'), keywords: ['edit', 'rewrite'], action: () => { if (requireCurrentNote()) queueAiDraft({ mode: 'edit', requiresCurrentNote: true, prompt: t('commandPalette.prompts.editCurrent') }) } },
    { id: 'ai-rewrite-selection', category: 'ai', label: t('commandPalette.commands.aiRewriteSelection.label'), description: t('commandPalette.commands.aiRewriteSelection.description'), keywords: ['selection', 'rewrite'], action: () => queueAiDraft({ mode: 'edit', attachSelection: true, prompt: t('commandPalette.prompts.rewriteSelection') }) },
    { id: 'ai-new-note', category: 'ai', label: t('commandPalette.commands.aiNewNote.label'), description: t('commandPalette.commands.aiNewNote.description'), keywords: ['generate', 'create'], action: () => queueAiDraft({ mode: 'edit', unboundEdit: true, prompt: t('commandPalette.prompts.newNote') }) },
    { id: 'ai-batch-notes', category: 'ai', label: t('commandPalette.commands.aiBatchNotes.label'), description: t('commandPalette.commands.aiBatchNotes.description'), keywords: ['batch', 'map', 'obsidian'], action: () => queueAiDraft({ mode: 'edit', unboundEdit: true, prompt: t('commandPalette.prompts.batchNotes') }) },
    { id: 'summarize', category: 'ai', label: t('commandPalette.commands.summarize.label'), description: t('commandPalette.commands.summarize.description'), keywords: ['summary'], action: async () => {
      if (!requireCurrentNote() || !content) return
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.summarizing'), 'info')
      const summary = await window.api.invoke('ai:summarize', { content, language })
      if (summary) {
        const newContent = `> ${summary}\n\n${content}`
        useEditorStore.getState().setContent(newContent)
        toast(t('commandPalette.toasts.summaryInserted'), 'success')
      }
    }},
    { id: 'plugin-local-pack', category: 'plugin', label: t('commandPalette.commands.pluginLocalPack.label'), description: t('commandPalette.commands.pluginLocalPack.description'), keywords: ['plugin', 'local', 'featured', 'pack'], action: async () => {
      if (!vaultPath) return
      const { toast } = await import('../stores/toast-store')
      const result = await window.api.invoke('plugins:install-local-pack-bundle', { vaultPath })
      setPlugins(result.plugins)
      toast(result.installed > 0 ? t('commandPalette.toasts.pluginsInstalled', { count: result.installed }) : t('commandPalette.toasts.pluginsAlreadyInstalled'), result.installed > 0 ? 'success' : 'info')
    }},
    { id: 'graph-full', category: 'graph', label: t('commandPalette.commands.graphFull.label'), shortcut: 'Ctrl+G', keywords: ['graph'], action: () => {
      setMainView('graph')
    }},
    { id: 'graph-current', category: 'graph', label: t('commandPalette.commands.graphCurrent.label'), description: t('commandPalette.commands.graphCurrent.description'), keywords: ['graph', 'mermaid'], action: () => {
      const filePath = currentFilePath
      if (!requireCurrentNote() || !filePath) return
      window.dispatchEvent(new CustomEvent('generate-graph', { detail: { path: filePath, isDirectory: false } }))
    }},
    { id: 'infer-links', category: 'graph', label: t('commandPalette.commands.inferLinks.label'), description: t('commandPalette.commands.inferLinks.description'), keywords: ['links', 'semantic'], action: async () => {
      if (!vaultPath) return
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.inferringLinks'), 'info')
      const result = await window.api.invoke('ai:infer-global-links', { vaultPath })
      if (result.success) {
        toast(t('commandPalette.toasts.linksAdded', { count: result.added || 0 }), 'success')
        window.dispatchEvent(new CustomEvent('graph-data-updated'))
        setMainView('graph')
      } else {
        toast(result.error || t('commandPalette.toasts.inferLinksFailed'), 'error')
      }
    }},
    { id: 'memory-index', category: 'graph', label: t('commandPalette.commands.memoryIndex.label'), description: t('commandPalette.commands.memoryIndex.description'), keywords: ['memory', 'index'], action: async () => {
      if (!vaultPath) return
      const { toast } = await import('../stores/toast-store')
      toast(t('commandPalette.toasts.generatingMemories'), 'info')
      const result = await window.api.invoke('ai:generate-memories', { vaultPath })
      if (result.success) {
        toast(t('commandPalette.toasts.memoriesDone', { generated: result.generated, skipped: result.skipped, failed: result.failed }), 'success')
        window.dispatchEvent(new CustomEvent('graph-data-updated'))
      }
      else toast(result.error || t('commandPalette.toasts.memoriesFailed'), 'error')
    }},
    { id: 'sync', category: 'sync', label: t('commandPalette.commands.sync.label'), shortcut: 'Ctrl+Shift+S', keywords: ['sync'], action: async () => {
      if (!vaultPath) return
      await window.api.invoke('cloud:sync', { vaultPath })
    }},
    { id: 'pull', category: 'sync', label: t('commandPalette.commands.pull.label'), keywords: ['pull'], action: async () => {
      if (!vaultPath) return
      await window.api.invoke('cloud:pull-all', { vaultPath })
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
    { id: 'publish-vault', category: 'export', label: t('commandPalette.commands.publishVault.label'), description: t('commandPalette.commands.publishVault.description'), keywords: ['publish', 'site', 'html', 'obsidian'], action: () => {
      if (!vaultPath) return
      setPublishScopeOpen(true)
    }},
    { id: 'share', category: 'export', label: t('commandPalette.commands.share.label'), keywords: ['share'], action: async () => {
      const filePath = currentFilePath
      if (!requireCurrentNote() || !filePath || !content) return
      const title = filePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') || 'note'
      await window.api.invoke('export:share', { content, title })
    }},
    { id: 'outline', category: 'interface', label: t('commandPalette.commands.outline.label'), shortcut: 'Ctrl+E', keywords: ['outline'], action: () => { if (requireCurrentNote()) setRightPanel('outline') } },
    { id: 'properties', category: 'interface', label: t('commandPalette.commands.properties.label'), description: t('commandPalette.commands.properties.description'), keywords: ['properties', 'frontmatter', 'obsidian'], action: () => { if (requireCurrentNote()) setRightPanel('properties') } },
    { id: 'settings', category: 'interface', label: t('commandPalette.commands.settings.label'), shortcut: 'Ctrl+,', keywords: ['settings'], action: () => setSettingsOpen(true) },
    { id: 'view-context-pack', category: 'interface', label: t('commandPalette.commands.viewContextPack.label'), description: t('commandPalette.commands.viewContextPack.description'), keywords: ['context', 'memory', 'long-context', 'observability', 'tune'], action: () => { useUIStore.getState().setSettingsInitialTab('long-context'); setSettingsOpen(true) } },
    { id: 'open-agent-panel', category: 'interface', label: t('commandPalette.commands.openAgent.label'), description: t('commandPalette.commands.openAgent.description'), keywords: ['agent', 'plan', 'execute', 'autonomy'], action: () => setRightPanel('agent') },
    { id: 'new-window', category: 'interface', label: t('commandPalette.commands.newWindow.label'), description: t('commandPalette.commands.newWindow.description'), keywords: ['window', 'multi'], action: () => window.api.windowControls.newWindow() },
    { id: 'sidebar', category: 'interface', label: t('commandPalette.commands.sidebar.label'), shortcut: 'Ctrl+Shift+B', keywords: ['sidebar'], action: () => {
      const state = useUIStore.getState()
      if (state.mainView === 'editor' && !state.sidebarCollapsed) toggleSidebar()
      else openFilesSidebar()
    } },
    { id: 'reset-workspace', category: 'interface', label: t('commandPalette.commands.resetWorkspace.label'), description: t('commandPalette.commands.resetWorkspace.description'), keywords: ['workspace', 'layout', 'reset'], action: () => resetWorkspaceLayout() },
    { id: 'focus', category: 'interface', label: t('commandPalette.commands.focus.label'), shortcut: 'F11', keywords: ['focus'], action: () => toggleFocusMode() },
    { id: 'theme', category: 'interface', label: t('commandPalette.commands.theme.label'), keywords: ['theme'], action: () => toggleTheme() },
    ...plugins.flatMap((plugin) => plugin.commands.map((command) => ({
      id: `plugin:${plugin.id}:${command.id}`,
      category: 'plugin' as const,
      label: `${plugin.name}: ${command.title}`,
      description: command.description || plugin.version,
      keywords: ['plugin', plugin.id, command.id],
      action: () => queueAiDraft({ mode: command.mode || 'chat', prompt: command.prompt })
    }))),
    ...plugins.flatMap((plugin) => plugin.panels.map((panel) => ({
      id: `plugin-panel:${plugin.id}:${panel.id}`,
      category: 'plugin' as const,
      label: `${plugin.name}: ${panel.title}`,
      description: panel.description || plugin.version,
      keywords: ['plugin', 'panel', plugin.id, panel.id],
      action: () => openPluginPanel(plugin, panel)
    }))),
    ...toolSurfaceEntries.map<PaletteCommand>((entry) => ({
      id: `tool:${entry.name}`,
      category: toolSurfaceCategoryToCommandCategory(entry.category),
      label: t(entry.labelKey, { defaultValue: entry.name }),
      description: t(entry.labelKey.replace(/\.label$/, '.description'), { defaultValue: '' }) || undefined,
      keywords: ['tool', ...entry.keywords],
      action: async () => {
        if (!vaultPath) {
          toast(t('commandPalette.toasts.openVaultFirst', { defaultValue: 'Open a vault first.' }), 'info')
          return
        }
        if (entry.requiresCurrentNote && !requireCurrentNote()) return
        const result = await window.api.invoke('ai:run-tool', {
          vaultPath,
          toolName: entry.name,
          currentFilePath: currentFilePath ?? null
        })
        if (result.ok) {
          window.dispatchEvent(new CustomEvent('tool-surface-result', {
            detail: {
              toolName: entry.name,
              labelKey: entry.labelKey,
              content: result.content,
              sources: result.sources ?? []
            }
          }))
        } else {
          toast(result.error, 'error')
        }
      }
    })),
  ], [saveFile, currentFilePath, content, vaultPath, setRightPanel, setSearchOpen, setSettingsOpen, openFilesSidebar, toggleSidebar, toggleTheme, toggleFocusMode, setMainView, resetWorkspaceLayout, setPublishScopeOpen, queueAiDraft, openPluginPanel, getCurrentNoteTitle, requireCurrentNote, plugins, toolSurfaceEntries, language, t])

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

  const categoryOrder: CommandCategory[] = ['ai', 'plugin', 'graph', 'search', 'file', 'sync', 'export', 'interface']

  useEffect(() => {
    if (open) {
      setQuery('')
      if (vaultPath) {
        window.api.invoke('plugins:list', { vaultPath }).then(setPlugins).catch(() => setPlugins([]))
      }
      window.api.invoke('ai:list-tool-surface', undefined)
        .then((res) => setToolSurfaceEntries(res.entries))
        .catch(() => setToolSurfaceEntries([]))
    }
  }, [open, vaultPath])

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
