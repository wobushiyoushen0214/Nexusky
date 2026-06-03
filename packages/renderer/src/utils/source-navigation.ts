import type { ChatSource } from '@shared/types/ipc'

export interface SourceNavigationTargetInput {
  line?: number
  endLine?: number
  heading?: string
  blockId?: string
  snippet?: string
}

function isAbsolutePath(filePath: string): boolean {
  return filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath)
}

function normalizePathForCompare(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function cleanPositiveInteger(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return undefined
  const integer = Math.floor(number)
  return integer > 0 ? integer : undefined
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function resolveVaultSourcePath(vaultPath: string | null | undefined, sourceFilePath: string): string | null {
  const filePath = cleanText(sourceFilePath)
  if (!filePath) return null
  if (isAbsolutePath(filePath)) return filePath
  const vault = cleanText(vaultPath)
  if (!vault) return null

  const normalizedVault = normalizePathForCompare(vault).replace(/\/+$/g, '')
  const normalizedFile = normalizePathForCompare(filePath).replace(/^\/+/g, '')
  if (normalizePathForCompare(filePath).startsWith(`${normalizedVault}/`)) return filePath
  return `${normalizedVault}/${normalizedFile}`
}

export function buildChatSourceNavigationTarget(source: ChatSource): SourceNavigationTargetInput | undefined {
  const line = cleanPositiveInteger(source.line)
  const endLine = cleanPositiveInteger(source.endLine)
  const heading = cleanText(source.heading)
  const blockId = cleanText(source.blockId)
  const snippet = cleanText(source.chunk)

  if (!line && !endLine && !heading && !blockId && !snippet) return undefined
  return { line, endLine, heading, blockId, snippet }
}

export function normalizeSourceNavigationText(text: string): string {
  return text
    .replace(/[`*_~>#\[\](){}|!:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function findMarkdownLineForSnippet(content: string, snippet: string): number | null {
  const normalizedSnippet = normalizeSourceNavigationText(snippet)
  if (normalizedSnippet.length < 8) return null

  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = normalizeSourceNavigationText(lines[index])
    if (line.length >= 8 && (line.includes(normalizedSnippet) || normalizedSnippet.includes(line))) {
      return index + 1
    }
  }

  const maxWindowLines = 6
  const compactNeedle = normalizedSnippet.slice(0, 180)
  for (let start = 0; start < lines.length; start++) {
    let windowText = ''
    for (let offset = 0; offset < maxWindowLines && start + offset < lines.length; offset++) {
      windowText = `${windowText} ${lines[start + offset]}`
      const normalizedWindow = normalizeSourceNavigationText(windowText)
      if (normalizedWindow.length >= 8 && (normalizedWindow.includes(compactNeedle) || normalizedSnippet.includes(normalizedWindow))) {
        return start + 1
      }
    }
  }

  return null
}

export function findMarkdownLineForHeading(content: string, heading: string): number | null {
  const target = normalizeSourceNavigationText(heading)
  if (!target) return null
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^#{1,6}\s+(.+)$/)
    if (match && normalizeSourceNavigationText(match[1]) === target) return index + 1
  }
  return null
}

export function findMarkdownLineForBlockId(content: string, blockId: string): number | null {
  const target = cleanText(blockId)?.replace(/^\^/, '')
  if (!target) return null
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    if (new RegExp(`\\^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*)$`).test(lines[index])) {
      return index + 1
    }
  }
  return null
}
