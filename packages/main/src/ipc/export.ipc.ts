import { ipcMain, dialog, BrowserWindow, clipboard, shell } from 'electron'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { basename, dirname, extname, join, relative, posix } from 'path'
import { renderMarkdownCallouts } from '@shared/markdown/callouts'
import { renderMarkdownFootnotes } from '@shared/markdown/footnotes'

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
    .callout { margin: 1.25rem 0; padding: 12px 14px; border: 1px solid #d9dee8; border-radius: 8px; background: #f5f7fb; }
    .callout-title { font-weight: 700; color: #273246; }
    .callout-body { margin-top: 6px; color: #526070; }
    .callout-warning, .callout-caution, .callout-danger { border-color: #f0c36d; background: #fff8e8; }
    .callout-tip, .callout-success { border-color: #9fcfb2; background: #eefaf2; }
    a { color: #6366f1; }
    img { max-width: 100%; border-radius: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #e5e5e5; padding: 8px 12px; text-align: left; }
    th { background: #f9f9f9; }
    .footnotes { margin-top: 2.5rem; font-size: 0.9em; color: #555; }
    .footnotes hr { margin-bottom: 1rem; }
    .footnote-ref { font-size: 0.78em; margin-left: 2px; }
    .footnote-backref { margin-left: 8px; font-size: 0.85em; }
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
      .callout { margin: 1.25rem 0; padding: 12px 14px; border: 1px solid #d9dee8; border-radius: 8px; background: #f5f7fb; }
      .callout-title { font-weight: 700; color: #273246; }
      .callout-body { margin-top: 6px; color: #526070; }
      .callout-warning, .callout-caution, .callout-danger { border-color: #f0c36d; background: #fff8e8; }
      .callout-tip, .callout-success { border-color: #9fcfb2; background: #eefaf2; }
      .footnotes { margin-top: 2.5rem; font-size: 0.9em; color: #555; }
      .footnote-ref { font-size: 0.78em; margin-left: 2px; }
      .footnote-backref { margin-left: 8px; font-size: 0.85em; }
    </style></head><body>${markdownToHtml(params.content)}</body></html>`

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfData = await printWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await writeFile(result.filePath, pdfData)
    printWin.close()
    return true
  })

  ipcMain.handle('export:share', async (_event, params: { content: string; title: string }) => {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${params.title} — Nexusky</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 48px 24px; line-height: 1.8; color: #1a1a2e; background: #fafafa; }
h1 { font-size: 1.8rem; margin: 2rem 0 1rem; color: #111; }
h2 { font-size: 1.4rem; margin: 1.5rem 0 0.75rem; color: #222; }
h3 { font-size: 1.15rem; margin: 1.25rem 0 0.5rem; }
code { background: #f0f0f5; padding: 2px 6px; border-radius: 4px; font-size: 0.88em; font-family: 'JetBrains Mono', monospace; }
pre { background: #1e1e2e; color: #cdd6f4; padding: 18px; border-radius: 10px; overflow-x: auto; }
pre code { background: none; color: inherit; }
blockquote { border-left: 3px solid #7c6ef0; padding-left: 1rem; color: #555; margin: 1rem 0; }
.callout { margin: 1.25rem 0; padding: 12px 14px; border: 1px solid #d9dee8; border-radius: 8px; background: #f5f7fb; }
.callout-title { font-weight: 700; color: #273246; }
.callout-body { margin-top: 6px; color: #526070; }
.callout-warning, .callout-caution, .callout-danger { border-color: #f0c36d; background: #fff8e8; }
.callout-tip, .callout-success { border-color: #9fcfb2; background: #eefaf2; }
a { color: #7c6ef0; text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; border-radius: 8px; margin: 1rem 0; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #e0e0e0; padding: 8px 12px; }
th { background: #f5f5f5; font-weight: 600; }
hr { border: none; height: 1px; background: #e0e0e0; margin: 2rem 0; }
.footnotes { margin-top: 2.5rem; font-size: 0.9em; color: #555; }
.footnote-ref { font-size: 0.78em; margin-left: 2px; }
.footnote-backref { margin-left: 8px; font-size: 0.85em; }
.footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e0e0e0; font-size: 0.8rem; color: #999; text-align: center; }
</style>
</head>
<body>
${markdownToHtml(params.content)}
<div class="footer">由 Nexusky 生成</div>
</body>
</html>`
    clipboard.writeText(html)
    return html
  })

  ipcMain.handle('export:publish-vault', async (event, params: { vaultPath: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, files: 0 }

    const result = await dialog.showOpenDialog(window, {
      title: '发布知识库',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, files: 0 }

    const outputPath = result.filePaths[0]
    const files = await collectPublishFiles(params.vaultPath)
    const markdownFiles = files.filter((file) => file.endsWith('.md'))
    const assetFiles = files.filter((file) => !file.endsWith('.md'))
    const notes = await Promise.all(markdownFiles.map(async (relPath) => {
      const content = await readFile(join(params.vaultPath, relPath), 'utf-8')
      const body = stripFrontmatter(content)
      return {
        relPath,
        href: relPath.replace(/\.md$/, '.html'),
        title: extractMarkdownTitle(body, relPath),
        body
      }
    }))
    const searchIndex = notes.map((note) => ({
      title: note.title,
      href: note.href,
      path: note.relPath,
      text: toPlainText(note.body).slice(0, 4000)
    }))

    const lookup = new Map<string, string>()
    for (const note of notes) {
      lookup.set(note.title, note.href)
      lookup.set(basename(note.relPath, '.md'), note.href)
    }

    for (const asset of assetFiles) {
      const dest = join(outputPath, asset)
      await mkdir(dirname(dest), { recursive: true })
      await copyFile(join(params.vaultPath, asset), dest)
    }

    for (const note of notes) {
      const dest = join(outputPath, note.href)
      await mkdir(dirname(dest), { recursive: true })
      const pageLookup = new Map(Array.from(lookup.entries()).map(([key, href]) => [key, relativeHref(note.href, href)]))
      await writeFile(dest, renderPublishPage(note.title, markdownToHtml(note.body, pageLookup), notes, note.href, searchIndex), 'utf-8')
    }

    await writeFile(join(outputPath, 'index.html'), renderPublishIndex(notes, searchIndex), 'utf-8')
    shell.showItemInFolder(join(outputPath, 'index.html'))
    return { ok: true, outputPath, files: notes.length }
  })
}

function markdownToHtml(md: string, wikilinkLookup = new Map<string, string>()): string {
  let html = renderMarkdownCallouts(renderMarkdownFootnotes(md))
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
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
      const href = wikilinkLookup.get(String(target).trim()) || '#'
      return `<a href="${href}">${label || target}</a>`
    })
    .replace(/^---$/gm, '<hr>')

  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
  html = html.split('\n').map((line) => {
    if (/^<\/?(h\d|ul|ol|li|blockquote|hr|img|section|aside|div)\b/.test(line)) return line
    if (line.trim() === '') return ''
    return `<p>${line}</p>`
  }).join('\n')

  return html
}

async function collectPublishFiles(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const result: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...await collectPublishFiles(root, fullPath))
    } else {
      result.push(relative(root, fullPath).replace(/\\/g, '/'))
    }
  }
  return result
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function extractMarkdownTitle(content: string, relPath: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || basename(relPath, '.md')
}

function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2 $1')
    .replace(/[#>*_`~\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function renderPublishPage(title: string, bodyHtml: string, notes: { title: string; href: string }[], currentHref: string, searchIndex: { title: string; href: string; path: string; text: string }[]): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Nexusky Publish</title>
${publishStyles()}
</head>
<body>
<aside>
  <a class="brand" href="${relativeHref(currentHref, 'index.html')}">Nexusky</a>
  ${renderPublishSearch(searchIndex, currentHref)}
  ${notes.map((note) => `<a href="${relativeHref(currentHref, note.href)}">${note.title}</a>`).join('\n  ')}
</aside>
<main>${bodyHtml}</main>
${publishSearchScript(searchIndex, currentHref)}
</body>
</html>`
}

function relativeHref(fromHref: string, toHref: string): string {
  const fromDir = posix.dirname(fromHref)
  const rel = fromDir === '.' ? toHref : posix.relative(fromDir, toHref)
  return rel || posix.basename(toHref)
}

function renderPublishIndex(notes: { title: string; href: string; relPath: string }[], searchIndex: { title: string; href: string; path: string; text: string }[]): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nexusky Publish</title>
${publishStyles()}
</head>
<body>
<aside>
  <a class="brand" href="index.html">Nexusky</a>
  ${renderPublishSearch(searchIndex, 'index.html')}
</aside>
<main>
  <h1>知识库索引</h1>
  <p class="muted">${notes.length} 篇已发布笔记</p>
  <div class="index-list">
    ${notes.map((note) => `<a class="index-card" href="${note.href}"><strong>${note.title}</strong><span>${note.relPath}</span></a>`).join('\n    ')}
  </div>
</main>
${publishSearchScript(searchIndex, 'index.html')}
</body>
</html>`
}

function renderPublishSearch(_searchIndex: { title: string; href: string; path: string; text: string }[], _currentHref: string): string {
  return `<div class="site-search">
  <input id="site-search-input" type="search" placeholder="搜索知识库..." autocomplete="off">
  <div id="site-search-results" class="site-search-results"></div>
</div>`
}

function publishSearchScript(searchIndex: { title: string; href: string; path: string; text: string }[], currentHref: string): string {
  return `<script>
window.__NEXUSKY_SEARCH__ = ${JSON.stringify(searchIndex).replace(/</g, '\\u003c')};
(function () {
  const input = document.getElementById('site-search-input');
  const results = document.getElementById('site-search-results');
  if (!input || !results) return;
  const fromDir = ${JSON.stringify(posix.dirname(currentHref))};
  function rel(href) {
    if (fromDir === '.') return href;
    const from = fromDir.split('/').filter(Boolean);
    const to = href.split('/').filter(Boolean);
    while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
    return '../'.repeat(from.length) + to.join('/');
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  input.addEventListener('input', function () {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const matches = window.__NEXUSKY_SEARCH__.filter(function (item) {
      return (item.title + ' ' + item.path + ' ' + item.text).toLowerCase().includes(q);
    }).slice(0, 8);
    results.innerHTML = matches.length ? matches.map(function (item) {
      return '<a href="' + rel(item.href) + '"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.path) + '</span></a>';
    }).join('') : '<p>无匹配结果</p>';
  });
})();
</script>`
}

function publishStyles(): string {
  return `<style>
body { margin: 0; display: grid; grid-template-columns: 260px minmax(0, 1fr); min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18212f; background: #f7f8fb; }
aside { position: sticky; top: 0; height: 100vh; overflow: auto; box-sizing: border-box; padding: 22px 16px; background: #101622; color: #d7deea; }
aside a { display: block; padding: 7px 9px; border-radius: 6px; color: #b9c3d6; text-decoration: none; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
aside a:hover { background: rgba(255,255,255,0.08); color: #fff; }
aside .brand { margin-bottom: 14px; color: #fff; font-weight: 700; font-size: 16px; }
.site-search { margin: 0 0 14px; }
.site-search input { box-sizing: border-box; width: 100%; height: 32px; padding: 0 10px; border: 1px solid rgba(255,255,255,0.12); border-radius: 7px; background: rgba(255,255,255,0.06); color: #fff; outline: none; }
.site-search input::placeholder { color: #7f8ba3; }
.site-search-results { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.site-search-results a { padding: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.05); }
.site-search-results a strong { display: block; color: #fff; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.site-search-results a span { display: block; margin-top: 2px; color: #8f9bb0; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.site-search-results p { margin: 0; padding: 8px; color: #8f9bb0; font-size: 12px; }
main { box-sizing: border-box; max-width: 840px; width: 100%; padding: 48px 34px 80px; line-height: 1.75; }
h1 { font-size: 2rem; line-height: 1.25; margin: 0 0 1.25rem; }
h2 { margin-top: 2rem; font-size: 1.45rem; }
h3 { margin-top: 1.5rem; font-size: 1.15rem; }
a { color: #4f46e5; }
code { background: #e9ecf3; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
pre { background: #111827; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #6366f1; margin: 1rem 0; padding-left: 1rem; color: #526070; }
.callout { margin: 1.25rem 0; padding: 12px 14px; border: 1px solid #d9dee8; border-radius: 8px; background: #f5f7fb; }
.callout-title { font-weight: 700; color: #273246; }
.callout-body { margin-top: 6px; color: #526070; }
.callout-warning, .callout-caution, .callout-danger { border-color: #f0c36d; background: #fff8e8; }
.callout-tip, .callout-success { border-color: #9fcfb2; background: #eefaf2; }
img { max-width: 100%; border-radius: 8px; }
table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
th, td { border: 1px solid #d9dee8; padding: 8px 10px; text-align: left; }
th { background: #edf0f6; }
.footnotes { margin-top: 2.75rem; font-size: 0.9em; color: #526070; }
.footnotes hr { margin-bottom: 1rem; }
.footnote-ref { font-size: 0.78em; margin-left: 2px; }
.footnote-backref { margin-left: 8px; font-size: 0.85em; }
.muted { color: #687386; }
.index-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 22px; }
.index-card { display: flex; flex-direction: column; gap: 4px; padding: 14px; border: 1px solid #dce1eb; border-radius: 8px; background: #fff; text-decoration: none; color: #18212f; }
.index-card span { color: #687386; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 760px) { body { display: block; } aside { position: static; height: auto; max-height: 240px; } main { padding: 28px 20px 56px; } }
</style>`
}
