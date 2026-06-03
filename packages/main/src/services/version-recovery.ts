import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative } from 'path'

function realPathOrOriginal(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

function vaultRelPath(vaultPath: string, filePath: string): string {
  return relative(realPathOrOriginal(vaultPath), realPathOrOriginal(filePath)).replace(/\\/g, '/')
}

export function saveVersionSnapshot(vaultPath: string, filePath: string): string | null {
  if (!filePath.endsWith('.md')) return null

  try {
    if (!existsSync(filePath)) return null

    const content = readFileSync(filePath, 'utf-8')
    const relPath = vaultRelPath(vaultPath, filePath)
    const historyDir = join(vaultPath, '.history', dirname(relPath))
    mkdirSync(historyDir, { recursive: true })

    const name = basename(filePath, '.md')
    const snapshots = readdirSync(historyDir)
      .filter((entry) => entry.startsWith(`${name}_`) && entry.endsWith('.md'))
      .sort()

    if (snapshots.length > 0) {
      const latestPath = join(historyDir, snapshots[snapshots.length - 1])
      if (readFileSync(latestPath, 'utf-8') === content) return null
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const snapshotPath = join(historyDir, `${name}_${timestamp}.md`)
    writeFileSync(snapshotPath, content, 'utf-8')

    if (snapshots.length >= 50) {
      for (const entry of snapshots.slice(0, snapshots.length - 49)) {
        rmSync(join(historyDir, entry), { force: true })
      }
    }

    return snapshotPath
  } catch {
    return null
  }
}

export function moveFileToVaultTrash(vaultPath: string, filePath: string, reason?: string): string | null {
  try {
    if (!existsSync(filePath)) return null

    const trashDir = join(vaultPath, '.trash')
    mkdirSync(trashDir, { recursive: true })

    const fileName = basename(filePath)
    const originalPath = vaultRelPath(vaultPath, filePath)
    const timestamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 6)
    const trashPath = join(trashDir, `${timestamp}_${rand}_${fileName}`)
    renameSync(filePath, trashPath)

    writeFileSync(`${trashPath}.json`, JSON.stringify({
      originalPath,
      deletedAt: timestamp,
      reason
    }), 'utf-8')

    return trashPath
  } catch {
    return null
  }
}
