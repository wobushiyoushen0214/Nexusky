import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { store } from '../services/store'
import { indexNote } from '../services/indexer'

export function registerTemplateIPC(): void {
  ipcMain.handle('template:daily-note', async (_event, params: { vaultPath: string }) => {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const dailyDir = join(params.vaultPath, 'daily')
    const filePath = join(dailyDir, `${dateStr}.md`)

    if (existsSync(filePath)) {
      return filePath
    }

    await mkdir(dailyDir, { recursive: true })

    const template = store.get('dailyTemplate') as string | undefined
    const content = template || `# ${dateStr}\n\n## 今日计划\n\n- \n\n## 笔记\n\n`

    await writeFile(filePath, content, 'utf-8')
    try { indexNote(params.vaultPath, filePath) } catch {}
    return filePath
  })

  ipcMain.handle('template:get-templates', () => {
    return (store.get('templates') as Template[] | undefined) || defaultTemplates
  })

  ipcMain.handle('template:get-marketplace', () => {
    const templates = getTemplates()
    const installedIds = new Set(templates.map((template) => template.id))
    return marketplaceTemplates.map((template) => ({
      ...template,
      installed: installedIds.has(template.id)
    }))
  })

  ipcMain.handle('template:install-marketplace', (_event, params: { templateId: string }) => {
    return installMarketplaceTemplates([params.templateId])
  })

  ipcMain.handle('template:install-marketplace-pack', () => {
    return installMarketplaceTemplates(marketplaceTemplates.map((template) => template.id))
  })

  ipcMain.handle('template:save-templates', (_event, params: { templates: Template[] }) => {
    store.set('templates', params.templates)
  })

  ipcMain.handle('template:create-from', async (_event, params: { vaultPath: string; templateId: string; title: string }) => {
    const templates = (store.get('templates') as Template[] | undefined) || defaultTemplates
    const template = templates.find((t) => t.id === params.templateId)
    if (!template) return null

    const content = template.content.replace(/\{\{title\}\}/g, params.title).replace(/\{\{date\}\}/g, new Date().toISOString().split('T')[0])
    const filePath = join(params.vaultPath, `${params.title}.md`)

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    try { indexNote(params.vaultPath, filePath) } catch {}
    return filePath
  })
}

interface Template {
  id: string
  name: string
  content: string
  description?: string
  category?: string
}

interface MarketplaceTemplate extends Template {
  author: string
  tags: string[]
}

function getTemplates(): Template[] {
  return (store.get('templates') as Template[] | undefined) || defaultTemplates
}

function installMarketplaceTemplates(templateIds: string[]): { installed: number; templates: Template[] } {
  const templates = getTemplates()
  const existingIds = new Set(templates.map((template) => template.id))
  const next = [...templates]
  let installed = 0

  for (const templateId of templateIds) {
    if (existingIds.has(templateId)) continue
    const template = marketplaceTemplates.find((item) => item.id === templateId)
    if (!template) continue
    next.push({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      content: template.content
    })
    existingIds.add(templateId)
    installed++
  }

  if (installed > 0) store.set('templates', next)
  return { installed, templates: next }
}

const defaultTemplates: Template[] = [
  {
    id: 'blank',
    name: '空白笔记',
    content: '# {{title}}\n\n'
  },
  {
    id: 'meeting',
    name: '会议记录',
    content: '# {{title}}\n\n**日期**: {{date}}\n**参与者**: \n\n## 议题\n\n- \n\n## 决议\n\n- \n\n## 待办\n\n- [ ] \n'
  },
  {
    id: 'reading',
    name: '读书笔记',
    content: '# {{title}}\n\n**作者**: \n**评分**: ⭐⭐⭐⭐⭐\n\n## 核心观点\n\n- \n\n## 摘录\n\n> \n\n## 感想\n\n'
  },
  {
    id: 'project',
    name: '项目文档',
    content: '# {{title}}\n\n## 目标\n\n\n\n## 技术方案\n\n\n\n## 进度\n\n- [ ] \n\n## 参考\n\n- \n'
  }
]

const marketplaceTemplates: MarketplaceTemplate[] = [
  {
    id: 'market-zettelkasten-permanent',
    name: 'Zettelkasten 永久笔记',
    description: '把 fleeting note 提炼成可长期链接的原子笔记',
    category: '知识管理',
    author: 'Nexusky',
    tags: ['zettelkasten', 'obsidian', 'knowledge'],
    content: '# {{title}}\n\naliases:: \ntags:: #zettelkasten\nstatus:: seed\n\n## 核心观点\n\n\n\n## 论证\n\n\n\n## 相关笔记\n\n- [[ ]]\n\n## 来源\n\n'
  },
  {
    id: 'market-literature-note',
    name: '文献/文章笔记',
    description: '记录来源、作者观点、摘录和可复用洞见',
    category: '研究',
    author: 'Nexusky',
    tags: ['research', 'reading'],
    content: '# {{title}}\n\ntags:: #reading\nstatus:: collecting\nsource:: \nauthor:: \n\n## 摘要\n\n\n\n## 关键摘录\n\n> \n\n## 我的理解\n\n\n\n## 可连接到\n\n- [[ ]]\n'
  },
  {
    id: 'market-project-adr',
    name: '项目决策记录 ADR',
    description: '记录技术决策背景、选项、结论和后果',
    category: '项目',
    author: 'Nexusky',
    tags: ['project', 'adr'],
    content: '# {{title}}\n\ntags:: #project, #adr\nstatus:: proposed\ndate:: {{date}}\n\n## 背景\n\n\n\n## 备选方案\n\n1. \n2. \n3. \n\n## 决策\n\n\n\n## 影响与后续\n\n- [ ] \n'
  },
  {
    id: 'market-weekly-review',
    name: '周复盘',
    description: '面向长期项目和个人知识库的周度复盘模板',
    category: '复盘',
    author: 'Nexusky',
    tags: ['review', 'weekly'],
    content: '# {{title}}\n\ntags:: #review/weekly\ndate:: {{date}}\n\n## 本周完成\n\n- \n\n## 关键收获\n\n- \n\n## 卡住的问题\n\n- \n\n## 下周重点\n\n- [ ] \n\n## 需要沉淀成笔记\n\n- [[ ]]\n'
  },
  {
    id: 'market-course-lesson',
    name: '课程学习笔记',
    description: '整理课程章节、概念、练习和延伸阅读',
    category: '学习',
    author: 'Nexusky',
    tags: ['course', 'learning'],
    content: '# {{title}}\n\ntags:: #course\nstatus:: learning\n\n## 本节目标\n\n\n\n## 概念地图\n\n- \n\n## 练习\n\n- [ ] \n\n## 易错点\n\n\n\n## 延伸链接\n\n- [[ ]]\n'
  }
]
