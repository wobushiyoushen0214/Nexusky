import { ipcMain, dialog, BrowserWindow, clipboard, shell } from 'electron'
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { basename, dirname, join, relative, posix } from 'path'
import matter from 'gray-matter'
import { renderMarkdownCallouts } from '@shared/markdown/callouts'
import { renderMarkdownFootnotes } from '@shared/markdown/footnotes'
import { renderMarkdownHighlights } from '@shared/markdown/highlights'
import { stripMarkdownComments } from '@shared/markdown/comments'
import { PUBLISH_MANIFEST_REL_PATH, buildPublishWikilinkLookup, collectPublishPreviewIssues, createPublishAccessOutputs, createPublishIncrementalPlan, expandPublishTransclusions, filterPublishCandidatesByScope, getPublishRobotsMeta, getPublishScopeLabel, normalizePublishAliases, parsePublishManifest, resolvePublishAssetReferences, resolvePublishAssetTargetPath, resolvePublishMarkdownLinkHref, resolvePublishWikilinkHref, serializePublishManifest, shouldPublishVaultEntry, toPublishSearchText, type PublishCandidate, type PublishOutputFile, type PublishWikilinkLookup } from '../services/publish'
import { getPropertyRows } from '../services/indexer'
import { store } from '../services/store'
import type { PublishAccessMode, PublishPreviewResult, PublishScope, PublishTarget } from '@shared/types/ipc'

interface PublishBuildNote extends PublishCandidate {
  href: string
  body: string
}

interface PublishPreviewData extends PublishPreviewResult {
  allFiles: string[]
  publishNotes: PublishBuildNote[]
}

const PUBLISH_TARGETS_STORE_KEY = 'publishTargets'

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
    mark { background: #fff2a8; border-radius: 3px; padding: 0 2px; }
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
      mark { background: #fff2a8; border-radius: 3px; padding: 0 2px; }
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
mark { background: #fff2a8; border-radius: 3px; padding: 0 2px; }
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

  ipcMain.handle('export:preview-publish-vault', async (event, params: { vaultPath: string; scope?: PublishScope }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { scopeLabel: '全部 vault', notes: [], assets: [], linkCount: 0, missingLinks: [], missingAssets: [] }
    return toRendererPublishPreview(await buildPublishPreview(params.vaultPath, params.scope))
  })

  ipcMain.handle('export:get-publish-target', async (_event, params: { vaultPath: string }) => {
    return getStoredPublishTarget(params.vaultPath)
  })

  ipcMain.handle('export:publish-vault', async (event, params: { vaultPath: string; scope?: PublishScope; access?: PublishAccessMode }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, files: 0 }

    const result = await dialog.showOpenDialog(window, {
      title: '发布 vault',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false, files: 0 }

    const outputPath = result.filePaths[0]
    const access = params.access || 'public'
    const preview = await buildPublishPreview(params.vaultPath, params.scope)
    const files = await collectPublishFilesForScope(params.vaultPath, params.scope, preview)
    const markdownFiles = files.filter((file) => file.endsWith('.md'))
    const assetFiles = files.filter((file) => !file.endsWith('.md'))
    const notes = await Promise.all(markdownFiles.map(async (relPath) => {
      const content = await readFile(join(params.vaultPath, relPath), 'utf-8')
      const parsed = matter(content)
      const body = parsed.content
      return {
        relPath,
        href: relPath.replace(/\.md$/, '.html'),
        title: extractMarkdownTitle(body, relPath),
        aliases: normalizePublishAliases(parsed.data),
        body
      }
    }))
    const searchIndex = notes.map((note) => ({
      title: note.title,
      href: note.href,
      path: note.relPath,
      text: toPublishSearchText(expandPublishTransclusions(note.body, notes)).slice(0, 4000)
    }))

    const outputs: PublishOutputFile[] = []

    for (const note of notes) {
      const pageLookup = buildPublishWikilinkLookup(notes.map((item) => ({
        title: item.title,
        relPath: item.relPath,
        aliases: item.aliases,
        href: relativeHref(note.href, item.href)
      })))
      const absoluteLookup = buildPublishWikilinkLookup(notes.map((item) => ({
        title: item.title,
        relPath: item.relPath,
        aliases: item.aliases,
        href: item.href
      })))
      const publishedNoteRelPaths = notes.map((item) => item.relPath)
      const html = markdownToHtml(
        expandPublishTransclusions(note.body, notes),
        pageLookup,
        (target) => {
          const resolved = resolvePublishMarkdownLinkHref(target, note.relPath, absoluteLookup, publishedNoteRelPaths)
          if (!isInternalPublishHtmlHref(resolved.href)) {
            const assetHref = resolvePublishAssetTargetPath(target, note.relPath, assetFiles)
            if (assetHref) return relativeHref(note.href, assetHref)
            return resolved.href
          }
          const [hrefPath, ...fragments] = resolved.href.split('#')
          return relativeHref(note.href, hrefPath) + (fragments.length > 0 ? `#${fragments.join('#')}` : '')
        },
        (target) => {
          const assetHref = resolvePublishAssetTargetPath(target, note.relPath, assetFiles)
          return assetHref ? relativeHref(note.href, assetHref) : null
        }
      )
      outputs.push({ relPath: note.href, content: renderPublishPage(note.title, html, note.href, access) })
    }

    const scopeLabel = getPublishScopeLabel(params.scope)
    outputs.push({ relPath: 'index.html', content: renderPublishIndex(notes, scopeLabel, access) })
    outputs.push({ relPath: 'site-data.js', content: renderPublishSiteData(notes, searchIndex) })
    for (const accessFile of createPublishAccessOutputs(access)) {
      outputs.push(accessFile)
    }

    for (const asset of assetFiles) {
      outputs.push({ relPath: asset, content: await readFile(join(params.vaultPath, asset)) })
    }

    const previousManifest = await readPublishManifest(outputPath)
    const plan = createPublishIncrementalPlan(outputs, previousManifest)

    for (const relPath of plan.removed) {
      await rm(join(outputPath, relPath), { force: true })
    }

    for (const output of plan.changed) {
      const dest = join(outputPath, output.relPath)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, output.content)
    }

    await writeFile(join(outputPath, PUBLISH_MANIFEST_REL_PATH), serializePublishManifest(plan.manifest), 'utf-8')
    setStoredPublishTarget(params.vaultPath, {
      outputPath,
      files: notes.length,
      scopeLabel,
      access,
      publishedAt: Date.now()
    })
    shell.showItemInFolder(join(outputPath, 'index.html'))
    return { ok: true, outputPath, files: notes.length, scopeLabel, access, updatedFiles: plan.changed.length, skippedFiles: plan.unchanged.length, removedFiles: plan.removed.length }
  })

  ipcMain.handle('export:unpublish-vault', async (_event, params: { vaultPath: string; outputPath?: string }) => {
    const target = params.outputPath ? { outputPath: params.outputPath } : getStoredPublishTarget(params.vaultPath)
    if (!target?.outputPath) return { ok: false, removedFiles: 0 }

    const previousManifest = await readPublishManifest(target.outputPath)
    const relPaths = Object.keys(previousManifest)
    let removedFiles = 0
    for (const relPath of relPaths) {
      await rm(join(target.outputPath, relPath), { force: true })
      removedFiles += 1
    }
    await rm(join(target.outputPath, PUBLISH_MANIFEST_REL_PATH), { force: true })
    clearStoredPublishTarget(params.vaultPath)
    return { ok: true, outputPath: target.outputPath, removedFiles }
  })
}

function getStoredPublishTarget(vaultPath: string): PublishTarget | null {
  const targets = (store.get(PUBLISH_TARGETS_STORE_KEY) as Record<string, PublishTarget> | undefined) || {}
  const target = targets[vaultPath]
  if (!target?.outputPath) return null
  return target
}

function setStoredPublishTarget(vaultPath: string, target: PublishTarget): void {
  const targets = (store.get(PUBLISH_TARGETS_STORE_KEY) as Record<string, PublishTarget> | undefined) || {}
  store.set(PUBLISH_TARGETS_STORE_KEY, { ...targets, [vaultPath]: target })
}

function clearStoredPublishTarget(vaultPath: string): void {
  const targets = { ...((store.get(PUBLISH_TARGETS_STORE_KEY) as Record<string, PublishTarget> | undefined) || {}) }
  delete targets[vaultPath]
  store.set(PUBLISH_TARGETS_STORE_KEY, targets)
}

async function readPublishManifest(outputPath: string) {
  try {
    return parsePublishManifest(await readFile(join(outputPath, PUBLISH_MANIFEST_REL_PATH), 'utf-8'))
  } catch {
    return {}
  }
}

function markdownToHtml(
  md: string,
  wikilinkLookup: PublishWikilinkLookup = buildPublishWikilinkLookup([]),
  markdownLinkResolver?: (target: string) => string,
  assetLinkResolver?: (target: string) => string | null
): string {
  let html = renderMarkdownHighlights(renderMarkdownCallouts(renderMarkdownFootnotes(stripMarkdownComments(md))))
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^\> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, label, target) => `<img src="${assetLinkResolver?.(String(target)) || target}" alt="${label}">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, target) => `<a href="${markdownLinkResolver ? markdownLinkResolver(String(target)) : target}">${label}</a>`)
    .replace(/!\[\[([^\]]+)\]\]/g, (match, rawTarget) => {
      const target = String(rawTarget).split('|')[0].split('#')[0]
      const href = assetLinkResolver?.(target)
      return href ? `<img src="${href}" alt="${basename(target)}">` : match
    })
    .replace(/(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
      const href = resolvePublishWikilinkHref(wikilinkLookup, String(target))
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
    if (!shouldPublishVaultEntry(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...await collectPublishFiles(root, fullPath))
    } else {
      result.push(relative(root, fullPath).replace(/\\/g, '/'))
    }
  }
  return result
}

async function collectPublishFilesForScope(root: string, scope?: PublishScope, preview?: PublishPreviewData): Promise<string[]> {
  const data = preview || await buildPublishPreview(root, scope)
  const files = data.allFiles
  if (!scope || scope.type === 'all') return files

  const scopedNotes = data.publishNotes
  const noteRelPaths = new Set(scopedNotes.map((note) => note.relPath))
  const scopedAssets = new Set(data.assets)

  return files.filter((file) => noteRelPaths.has(file) || scopedAssets.has(file))
}

async function buildPublishPreview(root: string, scope?: PublishScope): Promise<PublishPreviewData> {
  const files = await collectPublishFiles(root)
  const markdownFiles = files.filter((file) => file.endsWith('.md'))
  const assetFiles = files.filter((file) => !file.endsWith('.md'))
  const propertiesByPath = new Map(getPropertyRows(root).map((row) => [row.filePath, row.properties]))
  const candidates: PublishBuildNote[] = await Promise.all(markdownFiles.map(async (relPath) => {
    const content = await readFile(join(root, relPath), 'utf-8')
    const parsed = matter(content)
    const body = parsed.content
    return {
      relPath,
      href: relPath.replace(/\.md$/i, '.html'),
      title: extractMarkdownTitle(body, relPath),
      aliases: normalizePublishAliases(parsed.data),
      body,
      properties: propertiesByPath.get(relPath) || parsed.data
    }
  }))
  const scopedNotes = filterPublishCandidatesByScope(candidates, scope)
  const publishedNoteRelPaths = scopedNotes.map((note) => note.relPath)

  const scopedAssets = new Set<string>()
  if (!scope || scope.type === 'all') {
    for (const asset of assetFiles) scopedAssets.add(asset)
  } else {
    if (scope.type === 'folder') {
      const scopedAssetCandidates = filterPublishCandidatesByScope(
        assetFiles.map((relPath) => ({ relPath, title: basename(relPath) })),
        scope
      )
      for (const asset of scopedAssetCandidates) scopedAssets.add(asset.relPath)
    }
    for (const note of scopedNotes) {
      for (const asset of resolvePublishAssetReferences(note.body, note.relPath, assetFiles)) {
        scopedAssets.add(asset)
      }
    }
  }

  const lookup = buildPublishWikilinkLookup(scopedNotes.map((note) => ({
    title: note.title,
    relPath: note.relPath,
    aliases: note.aliases,
    href: note.href
  })))
  let linkCount = 0
  const missingLinks: PublishPreviewResult['missingLinks'] = []
  const missingAssets: PublishPreviewResult['missingAssets'] = []
  const notes = scopedNotes.map((note) => {
    const issues = collectPublishPreviewIssues(note, lookup, publishedNoteRelPaths, assetFiles)
    linkCount += issues.linkCount
    missingLinks.push(...issues.missingLinks)
    missingAssets.push(...issues.missingAssets)
    return {
      title: note.title,
      relPath: note.relPath,
      href: note.href,
      linkCount: issues.linkCount,
      missingLinkCount: issues.missingLinks.length
    }
  })

  return {
    allFiles: files,
    publishNotes: scopedNotes,
    scopeLabel: getPublishScopeLabel(scope),
    notes,
    assets: Array.from(scopedAssets).sort((a, b) => a.localeCompare(b)),
    linkCount,
    missingLinks,
    missingAssets
  }
}

function toRendererPublishPreview(preview: PublishPreviewData): PublishPreviewResult {
  return {
    scopeLabel: preview.scopeLabel,
    notes: preview.notes,
    assets: preview.assets,
    linkCount: preview.linkCount,
    missingLinks: preview.missingLinks,
    missingAssets: preview.missingAssets
  }
}

function extractMarkdownTitle(content: string, relPath: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || basename(relPath, '.md')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch)
}

function renderPublishPage(title: string, bodyHtml: string, currentHref: string, access: PublishAccessMode = 'public'): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${getPublishRobotsMeta(access)}
<title>${title} — Nexusky Publish</title>
${publishStyles()}
</head>
<body>
<aside>
  <a class="brand" href="${relativeHref(currentHref, 'index.html')}">Nexusky</a>
  ${renderPublishSearch()}
  <nav class="site-nav" data-current-href="${escapeHtml(currentHref)}"></nav>
</aside>
<main>${bodyHtml}</main>
<script src="${relativeHref(currentHref, 'site-data.js')}"></script>
${publishSearchScript(currentHref)}
</body>
</html>`
}

function relativeHref(fromHref: string, toHref: string): string {
  const fromDir = posix.dirname(fromHref)
  const rel = fromDir === '.' ? toHref : posix.relative(fromDir, toHref)
  return rel || posix.basename(toHref)
}

function isInternalPublishHtmlHref(href: string): boolean {
  return !/^(?:https?:|data:|mailto:|#)/i.test(href) && /\.html(?:#.*)?$/i.test(href)
}

function renderPublishIndex(notes: { title: string; href: string; relPath: string }[], scopeLabel = 'all', access: PublishAccessMode = 'public'): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${getPublishRobotsMeta(access)}
<title>Nexusky Publish</title>
${publishStyles()}
</head>
<body>
<aside>
  <a class="brand" href="index.html">Nexusky</a>
  ${renderPublishSearch()}
</aside>
<main>
  <h1>Vault 索引</h1>
  <p class="muted">${notes.length} 篇已发布笔记 · ${escapeHtml(scopeLabel)}</p>
  <div class="index-list">
    ${notes.map((note) => `<a class="index-card" href="${note.href}"><strong>${note.title}</strong><span>${note.relPath}</span></a>`).join('\n    ')}
  </div>
</main>
<script src="site-data.js"></script>
${publishSearchScript('index.html')}
</body>
</html>`
}

function renderPublishSearch(): string {
  return `<div class="site-search">
  <input id="site-search-input" type="search" placeholder="搜索 vault..." autocomplete="off">
  <div id="site-search-results" class="site-search-results"></div>
</div>`
}

function renderPublishSiteData(notes: { title: string; href: string }[], searchIndex: { title: string; href: string; path: string; text: string }[]): string {
  return [
    `window.__NEXUSKY_NAV__ = ${JSON.stringify(notes.map((note) => ({ title: note.title, href: note.href }))).replace(/</g, '\\u003c')};`,
    `window.__NEXUSKY_SEARCH__ = ${JSON.stringify(searchIndex).replace(/</g, '\\u003c')};`,
    ''
  ].join('\n')
}

function publishSearchScript(currentHref: string): string {
  return `<script>
(function () {
  const input = document.getElementById('site-search-input');
  const results = document.getElementById('site-search-results');
  const search = Array.isArray(window.__NEXUSKY_SEARCH__) ? window.__NEXUSKY_SEARCH__ : [];
  const nav = document.querySelector('.site-nav');
  const navItems = Array.isArray(window.__NEXUSKY_NAV__) ? window.__NEXUSKY_NAV__ : [];
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
  if (nav) {
    nav.innerHTML = navItems.map(function (item) {
      return '<a href="' + rel(item.href) + '"><span>' + escapeHtml(item.title) + '</span></a>';
    }).join('');
  }
  input.addEventListener('input', function () {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const matches = search.filter(function (item) {
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
