import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { store } from '../services/store'

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
    return filePath
  })

  ipcMain.handle('template:get-templates', () => {
    return (store.get('templates') as Template[] | undefined) || defaultTemplates
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
    return filePath
  })
}

interface Template {
  id: string
  name: string
  content: string
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
