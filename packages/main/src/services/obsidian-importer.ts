import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import { indexNote } from './indexer'

export interface ObsidianImportResult {
  imported: number
  converted: number
  indexed: number
}

export async function importObsidianVault(sourcePath: string, vaultPath: string): Promise<ObsidianImportResult> {
  const result: ObsidianImportResult = { imported: 0, converted: 0, indexed: 0 }

  async function importDir(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true })
    const entries = await readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const srcPath = join(src, entry.name)
      const destPath = join(dest, entry.name)
      if (entry.isDirectory()) {
        await importDir(srcPath, destPath)
      } else if (extname(entry.name) === '.md') {
        let content = await readFile(srcPath, 'utf-8')
        let didConvert = false
        content = content.replace(/^> \[!(\w+)\]\s*(.*)$/gm, (_, type, title) => {
          didConvert = true
          return `> **${type.charAt(0).toUpperCase() + type.slice(1)}${title ? ': ' + title : ''}**`
        })
        await writeFile(destPath, content, 'utf-8')
        indexNote(vaultPath, destPath)
        result.imported++
        result.indexed++
        if (didConvert) result.converted++
      } else {
        const data = await readFile(srcPath)
        await writeFile(destPath, data)
        result.imported++
      }
    }
  }

  await importDir(sourcePath, vaultPath)
  return result
}
