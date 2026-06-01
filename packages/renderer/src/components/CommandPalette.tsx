import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/ui-store'
import { useEditorStore } from '../stores/editor-store'
import { useVaultStore } from '../stores/vault-store'
import { toast } from '../stores/toast-store'
import { queueAiCommandDraft, type AICommandDraft } from './ai/ai-command-draft'
import { toolSurfaceCategoryToCommandCategory } from './tool-surface/tool-surface-category'
import type { LocalPlugin, PluginPanel, ToolSurfaceEntry } from '@shared/types/ipc'

type CommandCategory = 'file' | 'search' | 'ai' | 'plugin' | 'graph' | 'sync' | 'export' | 'interface'

interface Command {
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
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [plugins, setPlugins] = useState<LocalPlugin[]>([])
  const [toolSurfaceEntries, setToolSurfaceEntries] = useState<ToolSurfaceEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const { setRightPanel, setSearchOpen, setSettingsOpen, toggleSidebar, toggleTheme, toggleFocusMode, setMainView, resetWorkspaceLayout, setMaintenancePanelSection, setPublishScopeOpen, language } = useUIStore()
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

  const commands: Command[] = useMemo(() => [
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
    { id: 'template-marketplace-pack', category: 'file', label: t('commandPalette.commands.templateMarketplacePack.label'), description: t('commandPalette.commands.templateMarketplacePack.description'), keywords: ['template', 'marketplace', 'community'], action: async () => {
      const result = await window.api.invoke('template:install-marketplace-pack', undefined)
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
    { id: 'ai-rag', category: 'ai', label: t('commandPalette.commands.aiRag.label'), description: t('commandPalette.commands.aiRag.description'), keywords: ['rag', 'ask', 'agent'], action: () => queueAiDraft({ mode: 'chat', agentMode: true, prompt: t('commandPalette.prompts.rag') }) },
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
    { id: 'plugin-marketplace-pack', category: 'plugin', label: t('commandPalette.commands.pluginMarketplacePack.label'), description: t('commandPalette.commands.pluginMarketplacePack.description'), keywords: ['plugin', 'marketplace', 'pack'], action: async () => {
      if (!vaultPath) return
      const { toast } = await import('../stores/toast-store')
      const result = await window.api.invoke('plugins:install-marketplace-pack', { vaultPath })
      setPlugins(result.plugins)
      toast(result.installed > 0 ? t('commandPalette.toasts.pluginsInstalled', { count: result.installed }) : t('commandPalette.toasts.pluginsAlreadyInstalled'), result.installed > 0 ? 'success' : 'info')
    }},
    { id: 'graph-full', category: 'graph', label: t('commandPalette.commands.graphFull.label'), shortcut: 'Ctrl+G', keywords: ['graph'], action: () => {
      setMainView('graph')
    }},
    { id: 'bases', category: 'search', label: t('commandPalette.commands.bases.label'), description: t('commandPalette.commands.bases.description'), keywords: ['bases', 'database', 'properties', 'obsidian'], action: () => setMainView('bases') },
    { id: 'timeline', category: 'search', label: t('commandPalette.commands.timeline.label'), description: t('commandPalette.commands.timeline.description'), keywords: ['timeline', 'history', 'recent', 'activity'], action: () => setMainView('timeline') },
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
    { id: 'open-maintenance', category: 'interface', label: t('commandPalette.commands.openMaintenance.label'), description: t('commandPalette.commands.openMaintenance.description'), keywords: ['maintenance', 'queue', 'fix'], action: () => { setMaintenancePanelSection('queue'); setRightPanel('maintenance') } },
    { id: 'new-window', category: 'interface', label: t('commandPalette.commands.newWindow.label'), description: t('commandPalette.commands.newWindow.description'), keywords: ['window', 'multi'], action: () => window.api.windowControls.newWindow() },
    { id: 'sidebar', category: 'interface', label: t('commandPalette.commands.sidebar.label'), shortcut: 'Ctrl+Shift+B', keywords: ['sidebar'], action: () => toggleSidebar() },
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
    ...toolSurfaceEntries.map<Command>((entry) => ({
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
  ], [saveFile, currentFilePath, content, vaultPath, setRightPanel, setSearchOpen, setSettingsOpen, toggleSidebar, toggleTheme, toggleFocusMode, setMainView, resetWorkspaceLayout, setMaintenancePanelSection, setPublishScopeOpen, queueAiDraft, openPluginPanel, getCurrentNoteTitle, requireCurrentNote, plugins, toolSurfaceEntries, t])

  const filtered = query.trim()
    ? commands.filter((c) => {
      const q = query.toLowerCase()
      return [c.label, c.category, c.description, c.id, ...(c.keywords || [])].some((part) => part?.toLowerCase().includes(q))
    })
    : commands

  const grouped = filtered.reduce<Record<string, Command[]>>((acc, command) => {
    if (!acc[command.category]) acc[command.category] = []
    acc[command.category].push(command)
    return acc
  }, {})

  const categoryOrder: CommandCategory[] = ['ai', 'plugin', 'graph', 'search', 'file', 'sync', 'export', 'interface']

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
      if (vaultPath) {
        window.api.invoke('plugins:list', { vaultPath }).then(setPlugins).catch(() => setPlugins([]))
      }
      window.api.invoke('ai:list-tool-surface', undefined)
        .then((res) => setToolSurfaceEntries(res.entries))
        .catch(() => setToolSurfaceEntries([]))
    }
  }, [open, vaultPath])

  const listRef = useRef<HTMLDivElement>(null)
  const commandRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) {
      if (e.key === 'Escape') onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.min(i + 1, filtered.length - 1)
        commandRefs.current[filtered[next]?.id]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.max(i - 1, 0)
        commandRefs.current[filtered[next]?.id]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action()
      onClose()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' } as React.CSSProperties}
      onClick={onClose}
    >
      <div
        style={{ width: 480, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder={t('commandPalette.placeholder')}
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary)' }}
          />
        </div>
        <div ref={listRef} style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px 12px', color: 'var(--text-tertiary)', fontSize: 13 }}>{t('commandPalette.empty')}</div>
          )}
          {categoryOrder.filter((category) => grouped[category]?.length).map((category) => (
            <div key={category} style={{ padding: '4px 0' }}>
              <div style={{ padding: '5px 10px 4px', fontSize: 10, letterSpacing: 0, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                {t(`commandPalette.categories.${category}`)}
              </div>
              {grouped[category].map((cmd) => {
                const i = filtered.findIndex((item) => item.id === cmd.id)
                return (
                  <button
                    key={cmd.id}
                    ref={(el) => { commandRefs.current[cmd.id] = el }}
                    onClick={() => { cmd.action(); onClose() }}
                    style={{
                      width: '100%',
                      minHeight: 42,
                      padding: '7px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 13,
                      color: i === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: i === selectedIndex ? 'var(--accent-muted)' : 'transparent',
                      border: 'none',
                      borderRadius: 7,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', color: 'inherit', fontWeight: i === selectedIndex ? 600 : 500 }}>{cmd.label}</span>
                      {cmd.description && <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmd.description}</span>}
                    </span>
                    {cmd.shortcut && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{cmd.shortcut}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
