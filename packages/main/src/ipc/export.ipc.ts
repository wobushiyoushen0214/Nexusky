import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'

export function registerExportIPC(): void {
  ipcMain.handle('export:html', async (event, params: { content: string; title: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false

    const result = await dialog.showSaveDialog(window, {
      title: '导出 HTML',
      defaultPath: `${params.title}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })

    if (result.canceled || !result.filePath) return false

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 40px 20px; line-height: 1.7; color: #1a1a1a; }
    h1 { font-size: 2rem; margin: 2rem 0 1rem; }
    h2 { font-size: 1.5rem; margin: 1.5rem 0 0.75rem; }
    h3 { font-size: 1.2rem; margin: 1.25rem 0 0.5rem; }
    code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #f4f4f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #6366f1; padding-left: 1rem; color: #666; margin: 1rem 0; }
    a { color: #6366f1; }
    img { max-width: 100%; border-radius: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #e5e5e5; padding: 8px 12px; text-align: left; }
    th { background: #f9f9f9; }
  </style>
</head>
<body>
${markdownToHtml(params.content)}
</body>
</html>`

    await writeFile(result.filePath, html, 'utf-8')
    return true
  })

  ipcMain.handle('export:pdf', async (event, params: { content: string; title: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false

    const result = await dialog.showSaveDialog(win, {
      title: '导出 PDF',
      defaultPath: `${params.title}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (result.canceled || !result.filePath) return false

    const printWin = new BrowserWindow({ show: false, width: 800, height: 600 })
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body { font-family: -apple-system, sans-serif; max-width: 680px; margin: 0 auto; padding: 40px; line-height: 1.7; }
      h1 { font-size: 1.8rem; } h2 { font-size: 1.4rem; } h3 { font-size: 1.1rem; }
      code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 0.85em; }
      pre { background: #f5f5f5; padding: 12px; border-radius: 6px; }
      blockquote { border-left: 3px solid #6366f1; padding-left: 12px; color: #555; }
    </style></head><body>${markdownToHtml(params.content)}</body></html>`

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfData = await printWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await writeFile(result.filePath, pdfData)
    printWin.close()
    return true
  })
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^\> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\[\[([^\]]+)\]\]/g, '<a href="#">$1</a>')
    .replace(/^---$/gm, '<hr>')

  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
  html = html.split('\n').map((line) => {
    if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<li') || line.startsWith('<blockquote') || line.startsWith('<hr') || line.startsWith('<img')) return line
    if (line.trim() === '') return ''
    return `<p>${line}</p>`
  }).join('\n')

  return html
}
