import { dialog, ipcMain, shell } from 'electron'
import { readFile, writeFile, mkdir, rename, rm, stat, access } from 'fs/promises'
import { readdir } from 'fs/promises'
import { join, dirname, extname, relative, basename } from 'path'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { getDatabase } from '../services/database'
import { indexNote } from '../services/indexer'
import { importObsidianVault } from '../services/obsidian-importer'
import { importNotionExport } from '../services/notion-importer'
import { importPocketBookmarks, importReadwiseCsv } from '../services/reader-importer'
import { extractDocumentTextFromBuffer } from '../services/document-text'
import { isPathInsideVault, assertPathInsideVault } from './file-path'
import { assertPathInsideCurrentVault, requireCurrentVaultPath } from './vault-guard'
import { ensureNonEmptyString, ensureSafeFileName } from './validators'
import { notifyVaultFilesChanged } from './events'
import type { FileEntry, TrashEntry } from '@shared/types/ipc'

async function saveSnapshot(filePath: string, vaultPath: string): Promise<void> {
  try {
    await access(filePath)
    const content = await readFile(filePath, 'utf-8')
    const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    const historyDir = join(vaultPath, '.history', dirname(relPath))
    await mkdir(historyDir, { recursive: true })
    const name = basename(filePath, '.md')

    const entries = await readdir(historyDir)
    const snapshots = entries.filter((e) => e.startsWith(name + '_') && e.endsWith('.md')).sort()

    if (snapshots.length > 0) {
      const latestPath = join(historyDir, snapshots[snapshots.length - 1])
      const latestContent = await readFile(latestPath, 'utf-8')
      if (latestContent === content) return
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const snapshotPath = join(historyDir, `${name}_${timestamp}.md`)
    await writeFile(snapshotPath, content, 'utf-8')

    if (snapshots.length >= 50) {
      const toDelete = snapshots.slice(0, snapshots.length - 49)
      for (const f of toDelete) {
        await rm(join(historyDir, f), { force: true })
      }
    }
  } catch {}
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function parseTrashOriginalName(fileName: string): string {
  const parts = fileName.split('_')
  return parts.length >= 3 ? parts.slice(2).join('_') : fileName
}

async function getUniqueRestorePath(destPath: string): Promise<string> {
  if (!(await pathExists(destPath))) return destPath
  const dir = dirname(destPath)
  const ext = extname(destPath)
  const base = basename(destPath, ext)
  for (let i = 1; i < 1000; i++) {
    const candidate = join(dir, `${base} restored ${i}${ext}`)
    if (!(await pathExists(candidate))) return candidate
  }
  return join(dir, `${base} restored ${Date.now()}${ext}`)
}

let writeNotifyTimer: ReturnType<typeof setTimeout> | null = null
const writeNotifyPaths = new Set<string>()

export function registerFileIPC(): void {
  ipcMain.handle('file:read', async (_event, params: { path: string }) => {
    const { filePath } = await assertPathInsideCurrentVault(params.path)
    return readFile(filePath, 'utf-8')
  })

  ipcMain.handle('file:extract-document-text', async (_event, params: { path: string }) => {
    const { filePath } = await assertPathInsideCurrentVault(params.path)
    return extractDocumentTextFromBuffer(filePath, await readFile(filePath))
  })

  ipcMain.handle('file:stat', async (_event, params: { path: string }) => {
    const { filePath } = await assertPathInsideCurrentVault(params.path)
    const s = await stat(filePath)
    return { size: s.size, mtime: s.mtimeMs }
  })

  ipcMain.handle('file:write', async (_event, params: { path: string; content: string; vaultPath?: string }) => {
    ensureNonEmptyString(params?.path, 'file:write.path')
    if (typeof params?.content !== 'string') {
      throw new Error('Invalid IPC payload: file:write.content must be a string')
    }
    const { vaultPath, filePath } = await assertPathInsideCurrentVault(params.path, params.vaultPath)
    if (filePath.endsWith('.md')) {
      await saveSnapshot(filePath, vaultPath)
    }
    await writeFile(filePath, params.content, 'utf-8')
    if (filePath.endsWith('.md')) {
      try { indexNote(vaultPath, filePath) } catch {}
    }
    writeNotifyPaths.add(filePath)
    if (writeNotifyTimer) clearTimeout(writeNotifyTimer)
    writeNotifyTimer = setTimeout(() => {
      notifyVaultFilesChanged(Array.from(writeNotifyPaths))
      writeNotifyPaths.clear()
      writeNotifyTimer = null
    }, 120)
  })

  ipcMain.handle('file:list', async (_event, params: { dirPath: string }) => {
    const { filePath } = await assertPathInsideCurrentVault(params.dirPath)
    return listDirectory(filePath)
  })

  ipcMain.handle('file:list-shallow', async (_event, params: { dirPath: string }) => {
    const { filePath } = await assertPathInsideCurrentVault(params.dirPath)
    return listDirectoryShallow(filePath)
  })

  ipcMain.handle('file:create', async (_event, params: { path: string; content?: string; vaultPath?: string }) => {
    ensureNonEmptyString(params?.path, 'file:create.path')
    const { vaultPath, filePath } = await assertPathInsideCurrentVault(params.path, params.vaultPath)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, params.content || '', 'utf-8')
    if (filePath.endsWith('.md')) {
      try { indexNote(vaultPath, filePath) } catch {}
    }
    notifyVaultFilesChanged([filePath])
  })

  ipcMain.handle('file:reveal', async (_event, params: { path: string }) => {
    const { filePath } = await assertPathInsideCurrentVault(params.path)
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('file:delete', async (_event, params: { path: string; vaultPath?: string }) => {
    ensureNonEmptyString(params?.path, 'file:delete.path')
    const { vaultPath, filePath } = await assertPathInsideCurrentVault(params.path, params.vaultPath)
    const trashDir = join(vaultPath, '.trash')
    await mkdir(trashDir, { recursive: true })
    const fileName = filePath.split(/[\\/]/).pop() || 'file'
    const timestamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 6)
    const trashPath = join(trashDir, `${timestamp}_${rand}_${fileName}`)
    await rename(filePath, trashPath)
    const originalPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    await writeFile(`${trashPath}.json`, JSON.stringify({ originalPath, deletedAt: timestamp }), 'utf-8')
    notifyVaultFilesChanged([filePath])
  })

  ipcMain.handle('file:rename', async (_event, params: { oldPath: string; newPath: string; vaultPath?: string }) => {
    ensureNonEmptyString(params?.oldPath, 'file:rename.oldPath')
    ensureNonEmptyString(params?.newPath, 'file:rename.newPath')
    const vaultPath = await requireCurrentVaultPath(params.vaultPath)
    const oldPath = await assertPathInsideVault(params.oldPath, vaultPath)
    const newPath = await assertPathInsideVault(params.newPath, vaultPath)
    await mkdir(dirname(newPath), { recursive: true })
    await rename(oldPath, newPath)

    if (oldPath.endsWith('.md') && newPath.endsWith('.md')) {
      const oldName = oldPath.split(/[\\/]/).pop()!.replace(/\.md$/, '')
      const newName = newPath.split(/[\\/]/).pop()!.replace(/\.md$/, '')
      if (oldName !== newName) {
        await updateWikilinks(vaultPath, oldName, newName)
      }
    }
    notifyVaultFilesChanged([oldPath, newPath])
  })

  ipcMain.handle('file:save-image', async (_event, params: { vaultPath: string; imageData: string; fileName: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    const safeName = ensureSafeFileName(params?.fileName, 'file:save-image.fileName')
    if (typeof params?.imageData !== 'string' || params.imageData.length === 0) {
      throw new Error('Invalid IPC payload: file:save-image.imageData must be a non-empty string')
    }
    const assetsDir = join(params.vaultPath, 'assets')
    await mkdir(assetsDir, { recursive: true })
    const filePath = join(assetsDir, safeName)
    if (!isPathInsideVault(filePath, assetsDir)) throw new Error('图片路径不在 assets 目录内')
    const base64Data = params.imageData.replace(/^data:image\/\w+;base64,/, '')
    await writeFile(filePath, Buffer.from(base64Data, 'base64'))
    notifyVaultFilesChanged([filePath])
    return `assets/${safeName}`
  })

  ipcMain.handle('file:get-history', async (_event, params: { vaultPath: string; filePath: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    const filePath = await assertPathInsideVault(params.filePath, vaultPath)
    const relPath = relative(vaultPath, filePath).replace(/\\/g, '/')
    const name = basename(filePath, '.md')
    const historyDir = join(vaultPath, '.history', dirname(relPath))
    try {
      const entries = await readdir(historyDir)
      const snapshots = entries
        .filter((e) => e.startsWith(name + '_') && e.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, 30)
        .map((e) => {
          const ts = e.replace(name + '_', '').replace('.md', '').replace(/-/g, (m, i) => i < 16 ? '-' : m === '-' ? ':' : '.')
          return { fileName: e, path: join(historyDir, e), timestamp: ts }
        })
      return snapshots
    } catch {
      return []
    }
  })

  ipcMain.handle('file:restore-history', async (_event, params: { snapshotPath: string; targetPath: string }) => {
    const { vaultPath } = await assertPathInsideCurrentVault(params.targetPath)
    const snapshotPath = await assertPathInsideVault(params.snapshotPath, vaultPath)
    const targetPath = await assertPathInsideVault(params.targetPath, vaultPath)
    const content = await readFile(snapshotPath, 'utf-8')
    await writeFile(targetPath, content, 'utf-8')
  })

  ipcMain.handle('file:encrypt', async (_event, params: { path: string; password: string }) => {
    const { filePath } = await assertPathInsideCurrentVault(params.path)
    const content = await readFile(filePath, 'utf-8')
    const salt = randomBytes(16)
    const key = scryptSync(params.password, salt, 32)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(content, 'utf-8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const payload = Buffer.concat([salt, iv, tag, encrypted])
    await writeFile(filePath, '---encrypted---\n' + payload.toString('base64'), 'utf-8')
    return true
  })

  ipcMain.handle('file:decrypt', async (_event, params: { path: string; password: string }) => {
    const { filePath } = await assertPathInsideCurrentVault(params.path)
    const raw = await readFile(filePath, 'utf-8')
    if (!raw.startsWith('---encrypted---\n')) return { success: false, error: '文件未加密' }
    try {
      const payload = Buffer.from(raw.slice('---encrypted---\n'.length), 'base64')
      const salt = payload.subarray(0, 16)
      const iv = payload.subarray(16, 28)
      const tag = payload.subarray(28, 44)
      const encrypted = payload.subarray(44)
      const key = scryptSync(params.password, salt, 32)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
      return { success: true, content: decrypted.toString('utf-8') }
    } catch {
      return { success: false, error: '密码错误' }
    }
  })

  ipcMain.handle('file:list-trash', async (_event, params: { vaultPath: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    const trashDir = join(vaultPath, '.trash')
    try {
      const entries = await readdir(trashDir)
      const trashEntries: TrashEntry[] = []
      for (const e of entries
        .filter((e) => e.endsWith('.md'))
        .sort()
        .reverse()) {
        const trashPath = join(trashDir, e)
        let metadata: { originalPath?: string; deletedAt?: number } = {}
        try {
          metadata = JSON.parse(await readFile(`${trashPath}.json`, 'utf-8')) as { originalPath?: string; deletedAt?: number }
        } catch {}
        trashEntries.push({
          fileName: e,
          originalName: metadata.originalPath?.split('/').pop() || parseTrashOriginalName(e),
          originalPath: metadata.originalPath,
          path: trashPath,
          deletedAt: metadata.deletedAt
        })
      }
      return trashEntries
    } catch {
      return []
    }
  })

  ipcMain.handle('file:restore-trash', async (_event, params: { trashPath: string; vaultPath: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    const trashPath = await assertPathInsideVault(params.trashPath, join(vaultPath, '.trash'))
    const fileName = trashPath.split(/[\\/]/).pop() || ''
    let originalPath = parseTrashOriginalName(fileName)
    try {
      const metadataPath = await assertPathInsideVault(`${trashPath}.json`, join(vaultPath, '.trash'))
      const metadata = JSON.parse(await readFile(metadataPath, 'utf-8')) as { originalPath?: string }
      if (metadata.originalPath) originalPath = metadata.originalPath
    } catch {}
    const destPath = join(vaultPath, originalPath)
    await assertPathInsideVault(destPath, vaultPath)
    const uniqueDestPath = await getUniqueRestorePath(destPath)
    await mkdir(dirname(uniqueDestPath), { recursive: true })
    await rename(trashPath, uniqueDestPath)
    await rm(`${trashPath}.json`, { force: true })
    notifyVaultFilesChanged([uniqueDestPath])
  })

  ipcMain.handle('file:empty-trash', async (_event, params: { vaultPath: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    const trashDir = join(vaultPath, '.trash')
    await rm(trashDir, { recursive: true, force: true })
    notifyVaultFilesChanged([vaultPath])
  })

  ipcMain.handle('file:import-obsidian', async (_event, params: { sourcePath?: string; vaultPath: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    if (params.sourcePath) throw new Error('导入源必须通过文件选择器选择')
    const open = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择 Obsidian 笔记库目录'
    })
    if (open.canceled || open.filePaths.length === 0) {
      return { imported: 0, converted: 0, indexed: 0, canceled: true }
    }
    const result = await importObsidianVault(open.filePaths[0], vaultPath)
    notifyVaultFilesChanged([vaultPath])
    return result
  })

  ipcMain.handle('file:import-readwise', async (_event, params: { sourcePath?: string; vaultPath: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    let sourcePath = params.sourcePath
    if (sourcePath) throw new Error('导入源必须通过文件选择器选择')
    if (!sourcePath) {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: '选择 Readwise CSV 导出文件',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { imported: 0, skipped: 0, indexed: 0, canceled: true }
      }
      sourcePath = result.filePaths[0]
    }
    const result = await importReadwiseCsv(sourcePath, vaultPath)
    notifyVaultFilesChanged([join(vaultPath, 'Imports', 'Readwise')])
    return result
  })

  ipcMain.handle('file:import-pocket', async (_event, params: { sourcePath?: string; vaultPath: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    let sourcePath = params.sourcePath
    if (sourcePath) throw new Error('导入源必须通过文件选择器选择')
    if (!sourcePath) {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: '选择 Pocket HTML 导出文件',
        filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { imported: 0, skipped: 0, indexed: 0, canceled: true }
      }
      sourcePath = result.filePaths[0]
    }
    const result = await importPocketBookmarks(sourcePath, vaultPath)
    notifyVaultFilesChanged([join(vaultPath, 'Imports', 'Pocket')])
    return result
  })

  ipcMain.handle('file:import-notion', async (_event, params: { sourcePath?: string; vaultPath: string }) => {
    const vaultPath = await requireCurrentVaultPath(params?.vaultPath)
    let sourcePath = params.sourcePath
    if (sourcePath) throw new Error('导入源必须通过文件选择器选择')
    if (!sourcePath) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择 Notion Markdown / CSV / HTML 导出文件夹'
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { imported: 0, converted: 0, indexed: 0, assets: 0, skipped: 0, canceled: true }
      }
      sourcePath = result.filePaths[0]
    }
    const result = await importNotionExport(sourcePath, vaultPath)
    notifyVaultFilesChanged([join(vaultPath, 'Imports', 'Notion')])
    return result
  })
}

async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const result: FileEntry[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const fullPath = join(dirPath, entry.name)
    const fileStat = await stat(fullPath)

    if (entry.isDirectory()) {
      const children = await listDirectory(fullPath)
      result.push({ name: entry.name, path: fullPath, isDirectory: true, children, mtime: fileStat.mtimeMs })
    } else if (extname(entry.name) === '.md') {
      result.push({ name: entry.name, path: fullPath, isDirectory: false, mtime: fileStat.mtimeMs })
    }
  }

  result.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })

  return result
}

async function listDirectoryShallow(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const result: FileEntry[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const fullPath = join(dirPath, entry.name)
    const fileStat = await stat(fullPath)

    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: fullPath, isDirectory: true, children: [], mtime: fileStat.mtimeMs })
    } else if (extname(entry.name) === '.md') {
      result.push({ name: entry.name, path: fullPath, isDirectory: false, mtime: fileStat.mtimeMs })
    }
  }

  result.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })

  return result
}

async function updateWikilinks(vaultPath: string, oldName: string, newName: string): Promise<void> {
  const pattern = new RegExp(`\\[\\[${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'g')
  const replacement = `[[${newName}]]`

  try {
    const db = getDatabase(vaultPath)
    const rows = db.prepare(`
      SELECT DISTINCT n.file_path
      FROM links l
      JOIN notes n ON n.id = l.source_note_id
      WHERE l.target_title = ?
    `).all(oldName) as { file_path: string }[]

    for (const row of rows) {
      const fullPath = join(vaultPath, row.file_path)
      const content = await readFile(fullPath, 'utf-8')
      if (pattern.test(content)) {
        pattern.lastIndex = 0
        const updated = content.replace(pattern, replacement)
        await writeFile(fullPath, updated, 'utf-8')
      }
    }
  } catch {
    // Fallback: walk the vault if DB query fails
    await updateWikilinksFallback(vaultPath, oldName, newName)
  }
}

async function updateWikilinksFallback(vaultPath: string, oldName: string, newName: string): Promise<void> {
  const pattern = new RegExp(`\\[\\[${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'g')
  const replacement = `[[${newName}]]`

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (extname(entry.name) === '.md') {
        const content = await readFile(full, 'utf-8')
        if (pattern.test(content)) {
          pattern.lastIndex = 0
          const updated = content.replace(pattern, replacement)
          await writeFile(full, updated, 'utf-8')
        }
      }
    }
  }

  await walk(vaultPath)
}
