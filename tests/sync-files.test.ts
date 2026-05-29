import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectSyncLocalFiles,
  getSyncContentType,
  normalizeSyncRelPath,
  shouldSyncRelPath
} from '../packages/main/src/services/cloud/sync-files'

function writeTestFile(basePath: string, relPath: string, content: string | Buffer = 'x'): void {
  const fullPath = join(basePath, relPath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
}

describe('sync file selection', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-sync-files-'))
  })

  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('collects notes, attachments, images, and memory JSON files', () => {
    writeTestFile(vaultPath, 'Note.md', '# Note')
    writeTestFile(vaultPath, 'Images/pic.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    writeTestFile(vaultPath, '.attachments/file.pdf', '%PDF')
    writeTestFile(vaultPath, 'Folder/raw.bin', Buffer.from([1, 2, 3]))
    writeTestFile(vaultPath, '.nexusky/memories/a.json', '{}')

    writeTestFile(vaultPath, '.nexusky/index.db', 'internal')
    writeTestFile(vaultPath, '.nexusky/sync-manifest-s3.json', '{}')
    writeTestFile(vaultPath, '.obsidian/workspace.json', '{}')
    writeTestFile(vaultPath, '.git/config', 'internal')
    writeTestFile(vaultPath, '.hidden.md', 'hidden')
    writeTestFile(vaultPath, 'Folder/.hidden.md', 'hidden')

    const relPaths = collectSyncLocalFiles(vaultPath).map((filePath) => normalizeSyncRelPath(relative(vaultPath, filePath)))

    expect(relPaths).toEqual([
      '.attachments/file.pdf',
      '.nexusky/memories/a.json',
      'Folder/raw.bin',
      'Images/pic.png',
      'Note.md'
    ])
  })

  it('filters remote paths with the same vault rules', () => {
    expect(shouldSyncRelPath('Note.md')).toBe(true)
    expect(shouldSyncRelPath('Images\\pic.png')).toBe(true)
    expect(shouldSyncRelPath('.attachments/file.pdf')).toBe(true)
    expect(shouldSyncRelPath('.nexusky/memories/a.json')).toBe(true)

    expect(shouldSyncRelPath('.nexusky/index.db')).toBe(false)
    expect(shouldSyncRelPath('.nexusky/sync-manifest-s3.json')).toBe(false)
    expect(shouldSyncRelPath('.obsidian/workspace.json')).toBe(false)
    expect(shouldSyncRelPath('.git/config')).toBe(false)
    expect(shouldSyncRelPath('.hidden.md')).toBe(false)
    expect(shouldSyncRelPath('Folder/.hidden.md')).toBe(false)
  })

  it('assigns content types for synced binary and text files', () => {
    expect(getSyncContentType('Note.md')).toBe('text/markdown; charset=utf-8')
    expect(getSyncContentType('.nexusky/memories/a.json')).toBe('application/json')
    expect(getSyncContentType('Images/pic.png')).toBe('image/png')
    expect(getSyncContentType('Images/pic.jpg')).toBe('image/jpeg')
    expect(getSyncContentType('Images/pic.webp')).toBe('image/webp')
    expect(getSyncContentType('Images/vector.svg')).toBe('image/svg+xml')
    expect(getSyncContentType('.attachments/file.pdf')).toBe('application/pdf')
    expect(getSyncContentType('Folder/raw.bin')).toBe('application/octet-stream')
  })
})
