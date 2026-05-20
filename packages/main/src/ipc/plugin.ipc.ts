import { ipcMain } from 'electron'
import { mkdir, readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { CssSnippet, LocalPlugin, PluginCommand, PluginEditorExtension, PluginPanel, ThemePackage } from '@shared/types/ipc'

const THEME_VARIABLES = new Set([
  '--bg-base',
  '--bg-surface',
  '--bg-elevated',
  '--bg-hover',
  '--bg-active',
  '--bg-glass',
  '--bg-glass-hover',
  '--bg-glass-solid',
  '--border-subtle',
  '--border-default',
  '--border-glow',
  '--border-shine',
  '--text-primary',
  '--text-secondary',
  '--text-tertiary',
  '--accent',
  '--accent-hover',
  '--accent-muted',
  '--accent-text',
  '--accent-glow',
  '--danger',
  '--danger-muted',
  '--sidebar-bg',
  '--editor-bg',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--shadow-glow'
])

function isCommand(value: unknown): value is PluginCommand {
  if (!value || typeof value !== 'object') return false
  const command = value as Partial<PluginCommand>
  return typeof command.id === 'string' && typeof command.title === 'string' && typeof command.prompt === 'string'
}

function isPanel(value: unknown): value is PluginPanel {
  if (!value || typeof value !== 'object') return false
  const panel = value as Partial<PluginPanel>
  return typeof panel.id === 'string' && typeof panel.title === 'string'
}

function isEditorExtension(value: unknown): value is PluginEditorExtension {
  if (!value || typeof value !== 'object') return false
  const extension = value as Partial<PluginEditorExtension>
  return (
    typeof extension.id === 'string' &&
    typeof extension.title === 'string' &&
    (extension.kind === 'markdown' || extension.kind === 'toolbar' || extension.kind === 'slash')
  )
}

function safeOptionalText(value: unknown, max = 1200): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
}

export function normalizePlugin(raw: unknown): LocalPlugin | null {
  if (!raw || typeof raw !== 'object') return null
  const plugin = raw as Partial<LocalPlugin> & { panels?: unknown; editorExtensions?: unknown; editor_extensions?: unknown }
  if (typeof plugin.id !== 'string' || typeof plugin.name !== 'string') return null
  const commands = Array.isArray(plugin.commands) ? plugin.commands.filter(isCommand).map((command) => ({
    id: command.id,
    title: command.title,
    description: safeOptionalText(command.description, 240),
    prompt: command.prompt,
    mode: command.mode === 'edit' ? 'edit' as const : 'chat' as const
  })) : []
  const rawPanels = Array.isArray(plugin.panels) ? plugin.panels : []
  const panels = rawPanels.filter(isPanel).map((panel) => ({
    id: panel.id,
    title: panel.title,
    description: safeOptionalText(panel.description, 240),
    content: safeOptionalText(panel.content)
  }))
  const rawExtensions = Array.isArray(plugin.editorExtensions)
    ? plugin.editorExtensions
    : Array.isArray(plugin.editor_extensions)
      ? plugin.editor_extensions
      : []
  const editorExtensions = rawExtensions.filter(isEditorExtension).map((extension) => ({
    id: extension.id,
    title: extension.title,
    description: safeOptionalText(extension.description, 240),
    kind: extension.kind
  }))
  return { id: plugin.id, name: plugin.name, version: plugin.version, commands, panels, editorExtensions }
}

function isSafeCssValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[;{}<>]/.test(value)
}

function normalizeThemePackage(raw: unknown, fileName: string, path: string): ThemePackage | null {
  if (!raw || typeof raw !== 'object') return null
  const theme = raw as Partial<ThemePackage> & { variables?: Record<string, unknown> }
  const sourceColors = theme.colors || theme.variables
  if (!sourceColors || typeof sourceColors !== 'object') return null
  const colors: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(sourceColors)) {
    const key = rawKey.startsWith('--') ? rawKey : `--${rawKey}`
    if (!THEME_VARIABLES.has(key) || !isSafeCssValue(rawValue)) continue
    colors[key] = rawValue.trim()
  }
  if (Object.keys(colors).length === 0) return null
  const fallbackId = fileName.replace(/\.json$/i, '')
  const id = typeof theme.id === 'string' && theme.id.trim() ? theme.id.trim() : fallbackId
  const name = typeof theme.name === 'string' && theme.name.trim() ? theme.name.trim() : fallbackId
  return {
    id,
    name,
    path,
    version: typeof theme.version === 'string' ? theme.version : undefined,
    author: typeof theme.author === 'string' ? theme.author : undefined,
    description: typeof theme.description === 'string' ? theme.description : undefined,
    colors
  }
}

export function registerPluginIPC(): void {
  ipcMain.handle('plugins:list', async (_event, params: { vaultPath: string }) => {
    const pluginDir = join(params.vaultPath, '.nexusky', 'plugins')
    await mkdir(pluginDir, { recursive: true })
    const entries = await readdir(pluginDir)
    const plugins: LocalPlugin[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const plugin = normalizePlugin(JSON.parse(await readFile(join(pluginDir, entry), 'utf-8')))
        if (plugin) plugins.push(plugin)
      } catch {}
    }
    return plugins
  })

  ipcMain.handle('snippets:list', async (_event, params: { vaultPath: string }) => {
    const snippetsDir = join(params.vaultPath, '.nexusky', 'snippets')
    await mkdir(snippetsDir, { recursive: true })
    const entries = await readdir(snippetsDir)
    const snippets: CssSnippet[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.css')) continue
      const path = join(snippetsDir, entry)
      try {
        snippets.push({
          name: entry.replace(/\.css$/i, ''),
          path,
          content: await readFile(path, 'utf-8')
        })
      } catch {}
    }
    return snippets.sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle('themes:list', async (_event, params: { vaultPath: string }) => {
    const themesDir = join(params.vaultPath, '.nexusky', 'themes')
    await mkdir(themesDir, { recursive: true })
    const entries = await readdir(themesDir)
    const themes: ThemePackage[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const path = join(themesDir, entry)
      try {
        const theme = normalizeThemePackage(JSON.parse(await readFile(path, 'utf-8')), entry, path)
        if (theme) themes.push(theme)
      } catch {}
    }
    return themes.sort((a, b) => a.name.localeCompare(b.name))
  })
}
