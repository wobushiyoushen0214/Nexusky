import { ipcMain } from 'electron'
import { access, mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { CssSnippet, LocalPlugin, PluginCommand, PluginEditorExtension, PluginMarketplaceItem, PluginPanel, ThemePackage } from '@shared/types/ipc'

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

type MarketplacePlugin = LocalPlugin & { author: string; tags: string[] }

const marketplacePlugins: MarketplacePlugin[] = [
  {
    id: 'market-research-synthesizer',
    name: 'Research Synthesizer',
    version: '0.1.0',
    author: 'Nexusky',
    tags: ['research', 'ai', 'writing'],
    commands: [
      {
        id: 'synthesize-sources',
        title: '综合多篇资料',
        description: '把当前上下文整理为可长期保存的研究笔记',
        prompt: '请基于当前上下文和知识库资料，生成一篇结构化研究综述，包含核心结论、证据、分歧点、待验证问题和建议的 [[双向链接]]。',
        mode: 'edit'
      },
      {
        id: 'find-research-gaps',
        title: '发现研究空白',
        description: '从已有笔记中找出缺口、冲突和下一步阅读方向',
        prompt: '请分析当前主题下的已有笔记，指出知识空白、互相冲突的观点、证据薄弱处，以及下一步应创建或补充的笔记。',
        mode: 'chat'
      }
    ],
    panels: [
      {
        id: 'research-flow',
        title: '研究工作流',
        description: '从收集到综合的插件工作流',
        content: '1. 收集网页剪藏和文献笔记\n2. 用“综合多篇资料”生成主题综述\n3. 用“发现研究空白”规划下一批笔记\n4. 在图谱中检查主题连接密度'
      }
    ],
    editorExtensions: [{ id: 'research-slash', title: '研究 Slash 命令', description: '在 Slash 菜单中暴露研究命令', kind: 'slash' }]
  },
  {
    id: 'market-meeting-copilot',
    name: 'Meeting Copilot',
    version: '0.1.0',
    author: 'Nexusky',
    tags: ['meeting', 'tasks', 'summary'],
    commands: [
      {
        id: 'meeting-summary',
        title: '生成会议纪要',
        description: '把转录或零散记录整理成纪要和行动项',
        prompt: '请把当前内容整理为会议纪要，包含背景、关键决定、行动项、负责人、截止日期和需要同步给相关人的摘要。',
        mode: 'edit'
      },
      {
        id: 'extract-follow-ups',
        title: '提取跟进事项',
        description: '从会议记录中提炼可执行任务',
        prompt: '请从当前笔记中提取所有跟进事项，按优先级排序，并指出每个事项的上下文、阻塞风险和建议下一步。',
        mode: 'chat'
      }
    ],
    panels: [
      {
        id: 'meeting-template',
        title: '会议结构',
        description: '可复制到新会议笔记的结构',
        content: '# 会议主题\n\n## 目标\n\n## 结论\n\n## 行动项\n- [ ] 事项 @负责人 截止日期\n\n## 风险\n\n## 后续同步'
      }
    ],
    editorExtensions: [{ id: 'meeting-slash', title: '会议 Slash 命令', kind: 'slash' }]
  },
  {
    id: 'market-zettel-coach',
    name: 'Zettel Coach',
    version: '0.1.0',
    author: 'Nexusky',
    tags: ['zettelkasten', 'links', 'quality'],
    commands: [
      {
        id: 'atomic-note-review',
        title: '检查原子化程度',
        description: '评估当前笔记是否适合长期知识库',
        prompt: '请检查当前笔记是否足够原子化：指出过大的段落、应该拆分的新笔记、缺少的上下文、可添加的 [[双向链接]] 和更清晰的标题建议。',
        mode: 'chat'
      },
      {
        id: 'rewrite-as-evergreen',
        title: '改写为常青笔记',
        description: '把临时记录改写成长期可复用知识',
        prompt: '请把当前笔记改写为常青笔记：保留事实，强化论点，补充上下文，拆出要点，并建议 3-5 个相关的 [[链接]]。',
        mode: 'edit'
      }
    ],
    panels: [
      {
        id: 'quality-checklist',
        title: '笔记质量检查表',
        description: '常青笔记自检清单',
        content: '- 标题表达一个明确观点\n- 正文能脱离原上下文理解\n- 有来源或证据\n- 至少连接 2 篇相关笔记\n- 包含下一步问题或应用场景'
      }
    ],
    editorExtensions: [{ id: 'zettel-slash', title: 'Zettel Slash 命令', kind: 'slash' }]
  }
]

function pluginDir(vaultPath: string): string {
  return join(vaultPath, '.nexusky', 'plugins')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function listLocalPlugins(vaultPath: string): Promise<LocalPlugin[]> {
  const dir = pluginDir(vaultPath)
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir)
  const plugins: LocalPlugin[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const plugin = normalizePlugin(JSON.parse(await readFile(join(dir, entry), 'utf-8')))
      if (plugin) plugins.push(plugin)
    } catch {}
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPluginMarketplace(vaultPath: string): Promise<PluginMarketplaceItem[]> {
  const installedIds = new Set((await listLocalPlugins(vaultPath)).map((plugin) => plugin.id))
  return marketplacePlugins.map((plugin) => ({
    ...plugin,
    installed: installedIds.has(plugin.id)
  }))
}

export async function installMarketplacePlugins(vaultPath: string, pluginIds: string[]): Promise<{ installed: number; plugins: LocalPlugin[] }> {
  const dir = pluginDir(vaultPath)
  await mkdir(dir, { recursive: true })
  const installedIds = new Set((await listLocalPlugins(vaultPath)).map((plugin) => plugin.id))
  let installed = 0
  for (const plugin of marketplacePlugins.filter((item) => pluginIds.includes(item.id))) {
    if (installedIds.has(plugin.id)) continue
    const targetPath = join(dir, `${plugin.id}.json`)
    if (await pathExists(targetPath)) continue
    await writeFile(targetPath, JSON.stringify(plugin, null, 2), 'utf-8')
    installedIds.add(plugin.id)
    installed += 1
  }
  return { installed, plugins: await listLocalPlugins(vaultPath) }
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
    return listLocalPlugins(params.vaultPath)
  })

  ipcMain.handle('plugins:get-marketplace', async (_event, params: { vaultPath: string }) => {
    return getPluginMarketplace(params.vaultPath)
  })

  ipcMain.handle('plugins:install-marketplace', async (_event, params: { vaultPath: string; pluginId: string }) => {
    return installMarketplacePlugins(params.vaultPath, [params.pluginId])
  })

  ipcMain.handle('plugins:install-marketplace-pack', async (_event, params: { vaultPath: string }) => {
    return installMarketplacePlugins(params.vaultPath, marketplacePlugins.map((plugin) => plugin.id))
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
