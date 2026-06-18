import { createHash } from 'crypto'
import { basename, posix } from 'path'
import { stripMarkdownComments } from '../../../shared/src/markdown/comments'
import type { PublishAccessMode, PublishPreviewAssetIssue, PublishPreviewLinkIssue, PublishPreviewRisk, PublishScope } from '@shared/types/ipc'
import { extractMarkdownBlockReference, extractMarkdownHeadingSection, extractNoteReferenceBlockId, extractNoteReferenceHeading } from './ai/note-lookup'

export interface PublishWikilinkNote {
  title: string
  relPath: string
  href: string
  aliases?: string[]
}

export interface PublishWikilinkLookup {
  exact: Map<string, string>
  caseInsensitive: Map<string, string>
}

export interface PublishTransclusionNote extends PublishWikilinkNote {
  body: string
}

export interface PublishCandidate {
  relPath: string
  title: string
  aliases?: string[]
  body?: string
  properties?: Record<string, unknown>
}

export interface PublishLocalLinkResolution {
  href: string
  missing: boolean
}

export interface PublishManifestEntry {
  hash: string
}

export type PublishManifest = Record<string, PublishManifestEntry>

export interface PublishOutputFile {
  relPath: string
  content: string | Buffer
}

export interface PublishAccessFile {
  relPath: string
  content: string
}

export interface PublishIncrementalPlan {
  changed: PublishOutputFile[]
  unchanged: string[]
  removed: string[]
  manifest: PublishManifest
}

const SKIPPED_PUBLISH_ENTRIES = new Set(['.obsidian', '.nexusky', '.trash', '.git', '.DS_Store'])
const PRIVATE_PUBLISH_TAGS = new Set(['private', 'secret', 'confidential', 'internal'])
export const PUBLISH_MANIFEST_REL_PATH = '.nexusky-publish-manifest.json'

export function shouldPublishVaultEntry(name: string): boolean {
  return !SKIPPED_PUBLISH_ENTRIES.has(name)
}

export function buildPublishWikilinkLookup(notes: PublishWikilinkNote[]): PublishWikilinkLookup {
  const exact = new Map<string, string>()
  const ambiguousExact = new Set<string>()
  const caseCandidates = new Map<string, Set<string>>()

  const addKey = (key: string, href: string) => {
    const normalized = normalizePublishWikilinkTarget(key)
    if (!normalized) return

    const existing = exact.get(normalized)
    if (existing && existing !== href) {
      exact.delete(normalized)
      ambiguousExact.add(normalized)
    } else if (!ambiguousExact.has(normalized)) {
      exact.set(normalized, href)
    }

    const lowerKey = normalized.toLowerCase()
    caseCandidates.set(lowerKey, new Set([...(caseCandidates.get(lowerKey) || []), href]))
  }

  for (const note of notes) {
    addKey(note.title, note.href)
    addKey(basename(note.relPath, '.md'), note.href)
    addKey(note.relPath, note.href)
    for (const alias of note.aliases || []) {
      addKey(alias, note.href)
    }
  }

  const caseInsensitive = new Map<string, string>()
  for (const [key, hrefs] of caseCandidates) {
    if (hrefs.size === 1) caseInsensitive.set(key, [...hrefs][0])
  }

  return { exact, caseInsensitive }
}

export function resolvePublishWikilinkHref(lookup: PublishWikilinkLookup, target: string): string {
  const normalized = normalizePublishWikilinkTarget(target)
  if (!normalized) return '#'
  return lookup.exact.get(normalized) || lookup.caseInsensitive.get(normalized.toLowerCase()) || '#'
}

export function resolvePublishLocalMarkdownHref(
  rawTarget: string,
  noteRelPath: string,
  publishedNoteRelPaths: string[]
): PublishLocalLinkResolution {
  const target = normalizeMarkdownLinkTarget(rawTarget)
  if (!target || isExternalPublishLink(target)) return { href: rawTarget, missing: false }

  const [pathPart, fragmentPart] = splitMarkdownLinkFragment(target)
  if (!pathPart) return { href: target, missing: false }
  if (!isPublishNoteLinkTarget(pathPart)) return { href: target, missing: false }
  const published = new Set(publishedNoteRelPaths.map(normalizePublishScopePath).filter(Boolean))
  const noteDir = posix.dirname(normalizePublishScopePath(noteRelPath))
  const normalizedTarget = normalizePublishScopePath(pathPart)
  const candidates = buildPublishNotePathCandidates(normalizedTarget, noteDir, pathPart.startsWith('/'))

  for (const candidate of candidates) {
    if (!published.has(candidate)) continue
    const href = candidate.replace(/\.md$/i, '.html') + (fragmentPart ? `#${fragmentPart}` : '')
    return { href, missing: false }
  }

  return { href: '#', missing: true }
}

export function resolvePublishMarkdownLinkHref(
  rawTarget: string,
  noteRelPath: string,
  lookup: PublishWikilinkLookup,
  publishedNoteRelPaths: string[]
): PublishLocalLinkResolution {
  const target = normalizeMarkdownLinkTarget(rawTarget)
  if (!target || isExternalPublishLink(target)) return { href: rawTarget, missing: false }

  const [pathPart] = splitMarkdownLinkFragment(target)
  if (!isPublishNoteLinkTarget(pathPart)) return { href: target, missing: false }
  const local = resolvePublishLocalMarkdownHref(rawTarget, noteRelPath, publishedNoteRelPaths)
  if (!local.missing) return local

  const wikiHref = resolvePublishWikilinkHref(lookup, pathPart)
  if (wikiHref !== '#') return { href: wikiHref, missing: false }

  return { href: '#', missing: true }
}

export function normalizePublishAliases(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.aliases ?? frontmatter.alias
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  return Array.from(new Set(values
    .flatMap((value) => String(value).split(','))
    .map((alias) => alias.trim())
    .filter(Boolean)))
}

export function toPublishSearchText(markdown: string): string {
  return stripMarkdownComments(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2 $1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/[#>*_`~=!\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function expandPublishTransclusions(markdown: string, notes: PublishTransclusionNote[]): string {
  if (!markdown.includes('![[')) return markdown

  const lookup = buildPublishWikilinkLookup(notes)
  return markdown.replace(/!\[\[([^\]]+)\]\]/g, (match, rawTarget: string) => {
    const [target, label] = rawTarget.split('|')
    const href = resolvePublishWikilinkHref(lookup, target)
    if (href === '#') return match

    const note = notes.find((item) => item.href === href)
    if (!note) return match

    const reference = `[[${rawTarget}]]`
    const blockId = extractNoteReferenceBlockId(reference)
    const heading = blockId ? null : extractNoteReferenceHeading(reference)
    const content = blockId
      ? extractMarkdownBlockReference(note.body, blockId)
      : heading
        ? extractMarkdownHeadingSection(note.body, heading)
        : note.body
    const body = (content || note.body).trim()
    if (!body) return match

    const title = (label || note.title).trim()
    return [
      `> [!note] ${title}`,
      ...body.split('\n').map((line) => `> ${line}`)
    ].join('\n')
  })
}

export function getPublishScopeLabel(scope?: PublishScope): string {
  if (!scope || scope.type === 'all') return '全部 vault'
  if (scope.type === 'folder') return `文件夹：${normalizePublishScopePath(scope.folderPath)}`
  if (scope.type === 'tag') return `标签：${normalizePublishScopeTag(scope.tag)}`
  return `属性：${scope.key.trim()}${scope.value?.trim() ? ` = ${scope.value.trim()}` : ''}`
}

export function filterPublishCandidatesByScope<T extends PublishCandidate>(candidates: T[], scope?: PublishScope): T[] {
  if (!scope || scope.type === 'all') return [...candidates]

  if (scope.type === 'folder') {
    const folder = normalizePublishScopePath(scope.folderPath)
    if (!folder) return [...candidates]
    const prefix = `${folder}/`
    return candidates.filter((candidate) => {
      const relPath = normalizePublishScopePath(candidate.relPath)
      return relPath === folder || relPath.startsWith(prefix)
    })
  }

  if (scope.type === 'tag') {
    const tag = normalizePublishScopeTag(scope.tag)
    if (!tag) return [...candidates]
    return candidates.filter((candidate) => hasPublishScopeTag(candidate, tag))
  }

  const key = scope.key.trim().toLowerCase()
  if (!key) return [...candidates]
  const value = scope.value?.trim().toLowerCase()
  return candidates.filter((candidate) => hasPublishScopeProperty(candidate, key, value))
}

export function resolvePublishAssetReferences(markdown: string, noteRelPath: string, availableAssetRelPaths: string[]): string[] {
  const available = new Set(availableAssetRelPaths.map(normalizePublishScopePath).filter(Boolean))
  const byBasename = new Map<string, Set<string>>()
  for (const relPath of available) {
    const key = basename(relPath).toLowerCase()
    byBasename.set(key, new Set([...(byBasename.get(key) || []), relPath]))
  }

  const references = new Set<string>()
  const addReference = (target: string) => {
    const resolved = resolvePublishAssetTarget(target, noteRelPath, available, byBasename)
    if (resolved) references.add(resolved)
  }

  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)\r\n]+)\)/g)) {
    addReference(match[1])
  }

  for (const match of markdown.matchAll(/!\[\[([^\]]+)\]\]/g)) {
    const target = String(match[1]).split('|')[0].split('#')[0]
    addReference(target)
  }

  return Array.from(references).sort()
}

export function resolvePublishAssetTargetPath(rawTarget: string, noteRelPath: string, availableAssetRelPaths: string[]): string | null {
  const available = new Set(availableAssetRelPaths.map(normalizePublishScopePath).filter(Boolean))
  const byBasename = new Map<string, Set<string>>()
  for (const relPath of available) {
    const key = basename(relPath).toLowerCase()
    byBasename.set(key, new Set([...(byBasename.get(key) || []), relPath]))
  }
  return resolvePublishAssetTarget(rawTarget, noteRelPath, available, byBasename)
}

export function collectPublishPreviewIssues(
  note: Pick<PublishCandidate, 'relPath' | 'title' | 'body'>,
  lookup: PublishWikilinkLookup,
  publishedNoteRelPaths: string[],
  availableAssetRelPaths: string[]
): { linkCount: number; missingLinks: PublishPreviewLinkIssue[]; missingAssets: PublishPreviewAssetIssue[] } {
  const missingLinks: PublishPreviewLinkIssue[] = []
  const missingAssets: PublishPreviewAssetIssue[] = []
  let linkCount = 0
  const lines = (note.body || '').split('\n')
  const availableAssets = createPublishAssetLookup(availableAssetRelPaths)

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1

    for (const match of line.matchAll(/(?<!!)\[([^\]]+)\]\(([^)\r\n]+)\)/g)) {
      const rawTarget = String(match[2])
      const target = normalizeMarkdownLinkTarget(rawTarget)
      if (!target || isExternalPublishLink(target)) continue
      const [pathPart] = splitMarkdownLinkFragment(target)
      if (!isPublishNoteLinkTarget(pathPart)) continue
      linkCount += 1
      const resolved = resolvePublishMarkdownLinkHref(rawTarget, note.relPath, lookup, publishedNoteRelPaths)
      if (resolved.missing) {
        missingLinks.push({
          sourceTitle: note.title,
          sourcePath: note.relPath,
          target,
          label: String(match[1]).trim() || undefined,
          line: lineNumber,
          context: line.trim().slice(0, 220),
          kind: 'markdown'
        })
      }
    }

    for (const match of line.matchAll(/(?<!!)\[\[([^\]]+)\]\]/g)) {
      const rawTarget = String(match[1])
      const [target, label] = rawTarget.split('|')
      const normalizedTarget = normalizePublishWikilinkTarget(target)
      if (!normalizedTarget) continue
      linkCount += 1
      if (resolvePublishWikilinkHref(lookup, target) === '#') {
        missingLinks.push({
          sourceTitle: note.title,
          sourcePath: note.relPath,
          target: normalizedTarget,
          label: label?.trim() || undefined,
          line: lineNumber,
          context: line.trim().slice(0, 220),
          kind: 'wikilink'
        })
      }
    }

    for (const target of collectPublishAssetTargetsFromLine(line)) {
      const resolved = resolvePublishAssetTarget(target, note.relPath, availableAssets.available, availableAssets.byBasename)
      if (!resolved) {
        missingAssets.push({
          sourceTitle: note.title,
          sourcePath: note.relPath,
          target: normalizeMarkdownLinkTarget(target) || target.trim(),
          line: lineNumber,
          context: line.trim().slice(0, 220)
        })
      }
    }
  }

  return { linkCount, missingLinks, missingAssets }
}

export function collectPublishPreviewRisks(
  notes: Pick<PublishCandidate, 'relPath' | 'title' | 'body' | 'properties'>[],
  missingLinks: PublishPreviewLinkIssue[],
  missingAssets: PublishPreviewAssetIssue[]
): PublishPreviewRisk[] {
  const risks: PublishPreviewRisk[] = []
  const wikilinks = missingLinks.filter((item) => item.kind === 'wikilink')
  const markdownLinks = missingLinks.filter((item) => item.kind === 'markdown')
  const privateTags = collectPrivatePublishTagExamples(notes)

  addPublishRisk(risks, 'unresolved_wikilink', wikilinks.length, wikilinks.map(formatPublishLinkIssueExample))
  addPublishRisk(risks, 'broken_markdown_link', markdownLinks.length, markdownLinks.map(formatPublishLinkIssueExample))
  addPublishRisk(risks, 'unpublished_asset', missingAssets.length, missingAssets.map(formatPublishAssetIssueExample))
  addPublishRisk(risks, 'private_tag', privateTags.length, privateTags)

  return risks
}

export function createPublishIncrementalPlan(outputs: PublishOutputFile[], previousManifest: PublishManifest = {}): PublishIncrementalPlan {
  const manifest: PublishManifest = {}
  const changed: PublishOutputFile[] = []
  const unchanged: string[] = []
  const currentPaths = new Set<string>()

  for (const output of outputs) {
    const relPath = normalizePublishOutputPath(output.relPath)
    if (!relPath || relPath === PUBLISH_MANIFEST_REL_PATH) continue
    currentPaths.add(relPath)
    const hash = hashPublishOutput(output.content)
    manifest[relPath] = { hash }
    if (previousManifest[relPath]?.hash === hash) {
      unchanged.push(relPath)
    } else {
      changed.push({ relPath, content: output.content })
    }
  }

  const removed = Object.keys(previousManifest)
    .map(normalizePublishOutputPath)
    .filter((relPath) => relPath && relPath !== PUBLISH_MANIFEST_REL_PATH && !currentPaths.has(relPath))
    .sort((a, b) => a.localeCompare(b))

  return {
    changed,
    unchanged: unchanged.sort((a, b) => a.localeCompare(b)),
    removed,
    manifest
  }
}

export function serializePublishManifest(manifest: PublishManifest): string {
  const ordered: PublishManifest = {}
  for (const relPath of Object.keys(manifest).sort((a, b) => a.localeCompare(b))) {
    ordered[relPath] = manifest[relPath]
  }
  return `${JSON.stringify({ version: 1, files: ordered }, null, 2)}\n`
}

export function parsePublishManifest(raw: string): PublishManifest {
  const parsed = JSON.parse(raw) as { files?: unknown }
  if (!parsed || typeof parsed !== 'object' || !parsed.files || typeof parsed.files !== 'object') return {}
  const manifest: PublishManifest = {}
  for (const [key, value] of Object.entries(parsed.files as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const hash = (value as { hash?: unknown }).hash
    const relPath = normalizePublishOutputPath(key)
    if (!relPath || typeof hash !== 'string' || !hash) continue
    manifest[relPath] = { hash }
  }
  return manifest
}

export function createPublishAccessOutputs(access: PublishAccessMode = 'public'): PublishAccessFile[] {
  const privateMode = access === 'private'
  const accessJson = [
    '{',
    `  "mode": "${privateMode ? 'private' : 'public'}",`,
    `  "indexed": ${privateMode ? 'false' : 'true'},`,
    `  "note": ${JSON.stringify(privateMode
      ? 'Static export marked noindex. Host access control must be configured on the hosting provider.'
      : 'Static export allows indexing unless the hosting provider applies stricter rules.')}`,
    '}',
    ''
  ].join('\n')
  return [
    {
      relPath: 'robots.txt',
      content: privateMode
        ? 'User-agent: *\nDisallow: /\n'
        : 'User-agent: *\nAllow: /\n'
    },
    {
      relPath: 'access.json',
      content: accessJson
    }
  ]
}

export function getPublishRobotsMeta(access: PublishAccessMode = 'public'): string {
  return access === 'private' ? '<meta name="robots" content="noindex,nofollow">' : ''
}

function normalizePublishWikilinkTarget(target: string): string {
  return stripObsidianLinkFragment(target)
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
}

function stripObsidianLinkFragment(target: string): string {
  return target
    .split('#')[0]
    .replace(/\^[A-Za-z0-9_-]+$/, '')
}

function normalizePublishScopePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/g, '')
}

function normalizeMarkdownLinkTarget(rawTarget: string): string {
  let target = rawTarget.trim().replace(/^<(.+)>$/, '$1').replace(/^['"]|['"]$/g, '')
  target = target.replace(/\s+['"].*['"]$/, '')
  try {
    target = decodeURIComponent(target)
  } catch {}
  return target.trim()
}

function splitMarkdownLinkFragment(target: string): [string, string] {
  const [pathPart, ...fragments] = target.split('#')
  return [pathPart.split('?')[0].trim(), fragments.join('#').trim()]
}

function isExternalPublishLink(target: string): boolean {
  return /^(?:https?:|data:|mailto:|#)/i.test(target)
}

function isPublishNoteLinkTarget(pathPart: string): boolean {
  const extension = posix.extname(pathPart).toLowerCase()
  return extension === '' || extension === '.md'
}

function buildPublishNotePathCandidates(normalizedTarget: string, noteDir: string, absolute: boolean): string[] {
  const candidates = new Set<string>()
  const addCandidate = (value: string) => {
    const normalized = normalizePublishScopePath(value)
    if (!normalized) return
    candidates.add(normalized)
    if (!/\.md$/i.test(normalized)) candidates.add(normalizePublishScopePath(`${normalized}.md`))
  }

  addCandidate(normalizedTarget)
  if (!absolute) {
    addCandidate(posix.join(noteDir === '.' ? '' : noteDir, normalizedTarget))
  }

  return Array.from(candidates)
}

function normalizePublishScopeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase()
}

function hasPublishScopeTag(candidate: PublishCandidate, tag: string): boolean {
  const values = collectPublishPropertyValues(candidate.properties?.tags)
  return values.some((value) => normalizePublishScopeTag(value) === tag)
    || collectPublishPropertyValues(candidate.properties?.tag).some((value) => normalizePublishScopeTag(value) === tag)
}

function hasPublishScopeProperty(candidate: PublishCandidate, key: string, value?: string): boolean {
  const properties = candidate.properties || {}
  const matchedKey = Object.keys(properties).find((propertyKey) => propertyKey.trim().toLowerCase() === key)
  if (!matchedKey) return false
  if (!value) return true
  return collectPublishPropertyValues(properties[matchedKey]).some((item) => item.trim().toLowerCase().includes(value))
}

function collectPublishPropertyValues(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap((item) => collectPublishPropertyValues(item))
  return [String(value)]
}

function addPublishRisk(risks: PublishPreviewRisk[], kind: PublishPreviewRisk['kind'], count: number, examples: string[]): void {
  if (count <= 0) return
  risks.push({
    kind,
    severity: 'blocker',
    count,
    examples: Array.from(new Set(examples.filter(Boolean))).slice(0, 3)
  })
}

function collectPrivatePublishTagExamples(notes: Pick<PublishCandidate, 'relPath' | 'title' | 'body' | 'properties'>[]): string[] {
  const examples: string[] = []
  for (const note of notes) {
    const tags = collectPublishTags(note)
    const matched = tags.find(isPrivatePublishTag)
    if (matched) examples.push(`${note.relPath} #${matched}`)
  }
  return examples
}

function collectPublishTags(note: Pick<PublishCandidate, 'body' | 'properties'>): string[] {
  const tags = new Set<string>()
  const addTag = (value: string) => {
    const normalized = normalizePublishScopeTag(value)
    if (normalized) tags.add(normalized)
  }

  for (const value of collectPublishPropertyValues(note.properties?.tags)) addTag(value)
  for (const value of collectPublishPropertyValues(note.properties?.tag)) addTag(value)

  const body = stripMarkdownComments(note.body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
  for (const match of body.matchAll(/(^|[\s([,{])#([A-Za-z0-9_/-]+)/g)) {
    addTag(String(match[2]))
  }

  return Array.from(tags)
}

function isPrivatePublishTag(tag: string): boolean {
  const root = tag.split('/')[0]
  return PRIVATE_PUBLISH_TAGS.has(root)
}

function formatPublishLinkIssueExample(issue: PublishPreviewLinkIssue): string {
  return `${issue.sourcePath}:${issue.line} -> ${issue.target}`
}

function formatPublishAssetIssueExample(issue: PublishPreviewAssetIssue): string {
  return `${issue.sourcePath}:${issue.line} -> ${issue.target}`
}

function resolvePublishAssetTarget(
  rawTarget: string,
  noteRelPath: string,
  available: Set<string>,
  byBasename: Map<string, Set<string>>
): string | null {
  let target = normalizeMarkdownLinkTarget(rawTarget)
  if (!target || /^(?:https?:|data:|mailto:|#)/i.test(target)) return null
  target = target.split('#')[0].split('?')[0].trim()
  if (!target || /\.md$/i.test(target)) return null

  const normalizedNotePath = normalizePublishScopePath(noteRelPath)
  const noteDir = posix.dirname(normalizedNotePath)
  const candidates = new Set<string>()
  const normalizedTarget = normalizePublishScopePath(target)
  if (normalizedTarget) {
    candidates.add(normalizedTarget)
    if (!target.startsWith('/')) {
      candidates.add(normalizePublishScopePath(posix.join(noteDir === '.' ? '' : noteDir, normalizedTarget)))
    }
  }

  for (const candidate of candidates) {
    if (available.has(candidate)) return candidate
  }

  if (!normalizedTarget.includes('/')) {
    const basenameMatches = byBasename.get(normalizedTarget.toLowerCase())
    if (basenameMatches?.size === 1) return Array.from(basenameMatches)[0]
  }

  return null
}

function createPublishAssetLookup(availableAssetRelPaths: string[]): { available: Set<string>; byBasename: Map<string, Set<string>> } {
  const available = new Set(availableAssetRelPaths.map(normalizePublishScopePath).filter(Boolean))
  const byBasename = new Map<string, Set<string>>()
  for (const relPath of available) {
    const key = basename(relPath).toLowerCase()
    byBasename.set(key, new Set([...(byBasename.get(key) || []), relPath]))
  }
  return { available, byBasename }
}

function collectPublishAssetTargetsFromLine(line: string): string[] {
  const targets: string[] = []
  for (const match of line.matchAll(/!\[[^\]]*\]\(([^)\r\n]+)\)/g)) {
    targets.push(String(match[1]))
  }
  for (const match of line.matchAll(/!\[\[([^\]]+)\]\]/g)) {
    targets.push(String(match[1]).split('|')[0].split('#')[0])
  }
  return targets
}

function normalizePublishOutputPath(path: string): string {
  const normalized = posix.normalize(path.trim().replace(/\\/g, '/').replace(/^\.?\//, ''))
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..' || posix.isAbsolute(normalized)) return ''
  return normalized
}

function hashPublishOutput(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}
