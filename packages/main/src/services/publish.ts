import { basename } from 'path'
import { stripMarkdownComments } from '../../../shared/src/markdown/comments'
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

const SKIPPED_PUBLISH_ENTRIES = new Set(['.obsidian', '.nexusky', '.trash', '.git', '.DS_Store'])

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
