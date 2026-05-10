import { ipcMain } from 'electron'
import { readFile, writeFile, mkdir, rename, rm } from 'fs/promises'
import { readdir, stat } from 'fs/promises'
import { join, basename, extname } from 'path'
import type { FileEntry } from '@shared/types/ipc'

export function registerFileIPC(): void {
  ipcMain.handle('file:read', async (_event, params: { path: string }) => {
    return readFile(params.path, 'utf-8')
  })

  ipcMain.handle('file:write', async (_event, params: { path: string; content: string }) => {
    await writeFile(params.path, params.content, 'utf-8')
  })

  ipcMain.handle('file:list', async (_event, params: { dirPath: string }) => {
    return listDirectory(params.dirPath)
  })

  ipcMain.handle('file:create', async (_event, params: { path: string; content?: string }) => {
    const dir = params.path.substring(0, params.path.lastIndexOf('/'))
    await mkdir(dir, { recursive: true })
    await writeFile(params.path, params.content || '', 'utf-8')
  })

  ipcMain.handle('file:delete', async (_event, params: { path: string }) => {
    await rm(params.path, { recursive: true })
  })

  ipcMain.handle('file:rename', async (_event, params: { oldPath: string; newPath: string }) => {
    await rename(params.oldPath, params.newPath)
  })
}

async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const result: FileEntry[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const fullPath = join(dirPath, entry.name)
    const fileEntry: FileEntry = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory()
    }

    if (entry.isDirectory()) {
      fileEntry.children = await listDirectory(fullPath)
    } else if (extname(entry.name) !== '.md') {
      continue
    }

    result.push(fileEntry)
  }

  result.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })

  return result
}
