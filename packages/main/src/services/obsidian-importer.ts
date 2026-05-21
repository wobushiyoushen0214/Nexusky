import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { indexNote } from './indexer'

export interface ObsidianImportResult {
  imported: number
  converted: number
  indexed: number
}

const SKIPPED_OBSIDIAN_ENTRIES = new Set(['.obsidian', '.trash', '.git', '.DS_Store'])

interface ObsidianCanvasNode {
  id?: string
  type?: string
  text?: string
  file?: string
  label?: string
}

interface ObsidianCanvasEdge {
  fromNode?: string
  toNode?: string
  label?: string
}

interface ObsidianCanvasDocument {
  nodes?: ObsidianCanvasNode[]
  edges?: ObsidianCanvasEdge[]
}

export async function importObsidianVault(sourcePath: string, vaultPath: string): Promise<ObsidianImportResult> {
  const result: ObsidianImportResult = { imported: 0, converted: 0, indexed: 0 }

  async function importDir(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true })
    const entries = await readdir(src, { withFileTypes: true })
    for (const entry of entries) {
      if (SKIPPED_OBSIDIAN_ENTRIES.has(entry.name)) continue
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
      } else if (extname(entry.name) === '.canvas') {
        const raw = await readFile(srcPath, 'utf-8')
        await writeFile(destPath, raw, 'utf-8')
        result.imported++

        const markdown = convertObsidianCanvasToMarkdown(entry.name, raw)
        if (markdown) {
          const markdownPath = `${destPath}.md`
          await writeFile(markdownPath, markdown, 'utf-8')
          indexNote(vaultPath, markdownPath)
          result.imported++
          result.converted++
          result.indexed++
        }
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

function convertObsidianCanvasToMarkdown(fileName: string, raw: string): string | null {
  let canvas: ObsidianCanvasDocument
  try {
    canvas = JSON.parse(raw) as ObsidianCanvasDocument
  } catch {
    return null
  }

  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : []
  const edges = Array.isArray(canvas.edges) ? canvas.edges : []
  if (nodes.length === 0 && edges.length === 0) return null

  const title = `${basename(fileName, '.canvas')} Canvas`
  const nodeLabels = new Map<string, string>()
  const lines = [
    `# ${title}`,
    '',
    'source:: obsidian-canvas',
    `canvas:: ${fileName}`,
    'type:: canvas',
    '',
    '## Nodes'
  ]

  for (const node of nodes) {
    const id = typeof node.id === 'string' ? node.id : ''
    const label = describeCanvasNode(node)
    if (id) nodeLabels.set(id, label)
    lines.push(`- ${label}`)
  }

  if (edges.length > 0) {
    lines.push('', '## Connections')
    for (const edge of edges) {
      const from = edge.fromNode ? nodeLabels.get(edge.fromNode) || edge.fromNode : 'Unknown'
      const to = edge.toNode ? nodeLabels.get(edge.toNode) || edge.toNode : 'Unknown'
      const label = typeof edge.label === 'string' && edge.label.trim() ? ` (${edge.label.trim()})` : ''
      lines.push(`- ${from} -> ${to}${label}`)
    }
  }

  return `${lines.join('\n')}\n`
}

function describeCanvasNode(node: ObsidianCanvasNode): string {
  if (node.type === 'file' && typeof node.file === 'string' && node.file.trim()) {
    return `[[${normalizeCanvasFileTarget(node.file)}]]`
  }
  if (typeof node.label === 'string' && node.label.trim()) return node.label.trim()
  if (typeof node.text === 'string' && node.text.trim()) {
    return node.text.trim().replace(/\s+/g, ' ').slice(0, 120)
  }
  return node.id || 'Untitled canvas node'
}

function normalizeCanvasFileTarget(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/').replace(/\.md$/i, '')
}
