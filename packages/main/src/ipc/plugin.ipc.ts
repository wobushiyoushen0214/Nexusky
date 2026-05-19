import { ipcMain } from 'electron'
import { mkdir, readdir, readFile } from 'fs/promises'
import { join } from 'path'
import type { CssSnippet, LocalPlugin, PluginCommand } from '@shared/types/ipc'

function isCommand(value: unknown): value is PluginCommand {
  if (!value || typeof value !== 'object') return false
  const command = value as Partial<PluginCommand>
  return typeof command.id === 'string' && typeof command.title === 'string' && typeof command.prompt === 'string'
}

function normalizePlugin(raw: unknown): LocalPlugin | null {
  if (!raw || typeof raw !== 'object') return null
  const plugin = raw as Partial<LocalPlugin>
  if (typeof plugin.id !== 'string' || typeof plugin.name !== 'string' || !Array.isArray(plugin.commands)) return null
  const commands = plugin.commands.filter(isCommand).map((command) => ({
    id: command.id,
    title: command.title,
    description: command.description,
    prompt: command.prompt,
    mode: command.mode === 'edit' ? 'edit' as const : 'chat' as const
  }))
  return { id: plugin.id, name: plugin.name, version: plugin.version, commands }
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
}
