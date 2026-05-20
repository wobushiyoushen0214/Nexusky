#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'

const SKIP_DIRS = new Set(['.git', '.nexusky', 'node_modules'])

export function parseArgs(argv) {
  const [command, ...rest] = argv
  const flags = {}
  const values = []
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = rest[i + 1]
      if (!next || next.startsWith('--')) {
        flags[key] = true
      } else {
        flags[key] = next
        i += 1
      }
    } else {
      values.push(arg)
    }
  }
  return { command, flags, values }
}

export function safeNoteFileName(title) {
  const normalized = String(title || '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (normalized || 'Untitled').slice(0, 120)
}

function assertInsideVault(vaultPath, targetPath) {
  const vault = resolve(vaultPath)
  const target = resolve(targetPath)
  const rel = relative(vault, target)
  if (rel === '' || (!rel.startsWith('..') && !rel.includes(`..${sep}`))) return
  throw new Error('目标路径必须位于 vault 内')
}

async function exists(path) {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

async function uniqueNotePath(vaultPath, dir, title) {
  const baseName = safeNoteFileName(title)
  const folder = resolve(vaultPath, dir || '.')
  assertInsideVault(vaultPath, folder)
  for (let i = 0; i < 1000; i += 1) {
    const suffix = i === 0 ? '' : ` ${i + 1}`
    const filePath = join(folder, `${baseName}${suffix}.md`)
    if (!await exists(filePath)) return filePath
  }
  throw new Error('无法生成不冲突的笔记文件名')
}

export async function readStdin() {
  if (process.stdin.isTTY) return ''
  return new Promise((resolveText, reject) => {
    let data = ''
    createReadStream(null, { fd: 0, encoding: 'utf8' })
      .on('data', (chunk) => { data += chunk })
      .on('end', () => resolveText(data))
      .on('error', reject)
  })
}

export async function createNote({ vaultPath, title, content = '', dir = '.', stdin = false }) {
  if (!vaultPath) throw new Error('缺少 --vault')
  if (!title) throw new Error('缺少 --title')
  const filePath = await uniqueNotePath(vaultPath, dir, title)
  const folder = resolve(filePath, '..')
  const stdinContent = stdin ? await readStdin() : ''
  const body = [content, stdinContent].filter(Boolean).join(content && stdinContent ? '\n' : '')
  const text = body.trim()
    ? `# ${title}\n\n${body.replace(/\s+$/, '')}\n`
    : `# ${title}\n`
  await mkdir(folder, { recursive: true })
  await writeFile(filePath, text, 'utf8')
  return filePath
}

async function walkMarkdownFiles(root, current = root, files = []) {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.nexusky') {
      if (SKIP_DIRS.has(entry.name)) continue
    }
    if (SKIP_DIRS.has(entry.name)) continue
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      await walkMarkdownFiles(root, path, files)
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      files.push(path)
    }
  }
  return files
}

function scoreMatch(title, lines, query) {
  const q = query.toLowerCase()
  if (title.toLowerCase().includes(q)) return 100
  const index = lines.findIndex((line) => line.toLowerCase().includes(q))
  return index >= 0 ? Math.max(1, 80 - index) : 0
}

export async function searchNotes({ vaultPath, query, limit = 20 }) {
  if (!vaultPath) throw new Error('缺少 --vault')
  if (!query) throw new Error('缺少搜索关键词')
  const files = await walkMarkdownFiles(resolve(vaultPath))
  const results = []
  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const lines = raw.split(/\r?\n/)
    const title = lines.find((line) => /^#\s+\S/.test(line))?.replace(/^#\s+/, '').trim() || basename(file, '.md')
    const score = scoreMatch(title, lines, query)
    if (score === 0) continue
    const lineIndex = lines.findIndex((line) => line.toLowerCase().includes(query.toLowerCase()))
    results.push({
      path: relative(vaultPath, file),
      title,
      line: lineIndex >= 0 ? lineIndex + 1 : 1,
      excerpt: lineIndex >= 0 ? lines[lineIndex].trim() : title,
      score
    })
  }
  return results
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, Number(limit) || 20)
}

function printHelp() {
  console.log(`Nexusky CLI

Usage:
  pnpm cli new --vault <path> --title <title> [--dir Inbox] [--content text] [--stdin]
  pnpm cli search --vault <path> <query> [--limit 20]
`)
}

export async function run(argv = process.argv.slice(2)) {
  const { command, flags, values } = parseArgs(argv)
  if (!command || command === 'help' || flags.help) {
    printHelp()
    return 0
  }
  if (command === 'new') {
    const filePath = await createNote({
      vaultPath: flags.vault,
      title: flags.title || values.join(' '),
      content: flags.content === true ? '' : flags.content || '',
      dir: flags.dir === true ? '.' : flags.dir || '.',
      stdin: flags.stdin === true
    })
    console.log(filePath)
    return 0
  }
  if (command === 'search') {
    const results = await searchNotes({
      vaultPath: flags.vault,
      query: values.join(' '),
      limit: flags.limit === true ? 20 : flags.limit || 20
    })
    for (const result of results) {
      console.log(`${result.path}:${result.line} ${result.title} - ${result.excerpt}`)
    }
    return 0
  }
  throw new Error(`未知命令: ${command}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
