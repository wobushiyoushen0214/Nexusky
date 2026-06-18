import type { ChatSource } from '@shared/types/ipc'

export interface SourceNavigationTargetInput {
  line?: number
  endLine?: number
  heading?: string
  blockId?: string
  snippet?: string
}

export type SourceNavigationStatus = 'targeted' | 'fallback-top' | 'file-only' | 'missing-file'
export type SourceNavigationMatch = 'line' | 'blockId' | 'heading' | 'snippet'

export interface SourceNavigationResult {
  status: SourceNavigationStatus
  target?: SourceNavigationTargetInput
  matchedBy?: SourceNavigationMatch
}

export interface ChatSourceNavigationResult extends SourceNavigationResult {
  filePath: string | null
}

export interface SourceNavigationIO {
  statFile?: (path: string) => Promise<unknown>
  readFile?: (path: string) => Promise<string>
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

function hasLineTarget(target: SourceNavigationTargetInput): boolean {
  return Boolean(cleanPositiveInteger(target.line) || cleanPositiveInteger(target.endLine))
}

function cleanNavigationTarget(target: SourceNavigationTargetInput | undefined): SourceNavigationTargetInput | undefined {
  if (!target) return undefined
  const line = cleanPositiveInteger(target.line)
  const endLine = cleanPositiveInteger(target.endLine)
  const heading = cleanText(target.heading)
  const blockId = cleanText(target.blockId)
  const snippet = cleanText(target.snippet)
  if (!line && !endLine && !heading && !blockId && !snippet) return undefined
  return { line, endLine, heading, blockId, snippet }
}

async function defaultStatFile(path: string): Promise<unknown> {
  return window.api.invoke('file:stat', { path })
}

async function defaultReadFile(path: string): Promise<string> {
  return window.api.invoke('file:read', { path })
}

export function resolveNavigationTargetFromContent(
  content: string,
  target: SourceNavigationTargetInput | undefined
): SourceNavigationResult {
  const cleanTarget = cleanNavigationTarget(target)
  if (!cleanTarget) return { status: 'file-only' }
  if (hasLineTarget(cleanTarget)) return { status: 'targeted', target: cleanTarget, matchedBy: 'line' }

  if (cleanTarget.blockId) {
    const line = findMarkdownLineForBlockId(content, cleanTarget.blockId)
    if (line) return { status: 'targeted', target: { ...cleanTarget, line }, matchedBy: 'blockId' }
  }
  if (cleanTarget.heading) {
    const line = findMarkdownLineForHeading(content, cleanTarget.heading)
    if (line) return { status: 'targeted', target: { ...cleanTarget, line }, matchedBy: 'heading' }
  }
  if (cleanTarget.snippet) {
    const line = findMarkdownLineForSnippet(content, cleanTarget.snippet)
    if (line) return { status: 'targeted', target: { ...cleanTarget, line }, matchedBy: 'snippet' }
  }

  return { status: 'fallback-top' }
}

export async function prepareSourceNavigation(
  filePath: string,
  target?: SourceNavigationTargetInput,
  io: SourceNavigationIO = {}
): Promise<SourceNavigationResult> {
  const path = cleanText(filePath)
  if (!path) return { status: 'missing-file' }

  const statFile = io.statFile ?? defaultStatFile
  const readFile = io.readFile ?? defaultReadFile

  if (statFile) {
    try {
      await statFile(path)
    } catch {
      return { status: 'missing-file' }
    }
  }

  const cleanTarget = cleanNavigationTarget(target)
  if (!cleanTarget) return { status: 'file-only' }
  if (hasLineTarget(cleanTarget)) return { status: 'targeted', target: cleanTarget, matchedBy: 'line' }

  try {
    const content = await readFile(path)
    return resolveNavigationTargetFromContent(content, cleanTarget)
  } catch {
    return { status: 'missing-file' }
  }
}

export async function prepareChatSourceNavigation(
  vaultPath: string | null | undefined,
  source: ChatSource,
  io?: SourceNavigationIO
): Promise<ChatSourceNavigationResult> {
  const filePath = resolveVaultSourcePath(vaultPath, source.filePath)
  if (!filePath) return { filePath: null, status: 'missing-file' }
  const result = await prepareSourceNavigation(filePath, buildChatSourceNavigationTarget(source), io)
  return { ...result, filePath }
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
