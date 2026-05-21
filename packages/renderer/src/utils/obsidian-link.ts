export type ObsidianLinkReference = {
  target: string
  label?: string
  fragment?: string
  blockId?: string
  heading?: string
}

export function normalizeObsidianLinkTarget(value: string): string {
  return parseObsidianLinkReference(value).target
}

export function parseObsidianLinkReference(value: string): ObsidianLinkReference {
  const [rawTarget, rawLabel] = value.trim().replace(/^\[\[|\]\]$/g, '').split('|')
  const hashIndex = rawTarget.indexOf('#')
  const targetWithOptionalBlock = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget
  const fragment = hashIndex >= 0 ? rawTarget.slice(hashIndex + 1).trim() : undefined
  const trailingBlockMatch = hashIndex < 0 ? targetWithOptionalBlock.match(/\^([A-Za-z0-9_-]+)$/) : null
  const target = (trailingBlockMatch ? targetWithOptionalBlock.slice(0, -trailingBlockMatch[0].length) : targetWithOptionalBlock)
    .split('|')[0]
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
  const blockId = fragment?.startsWith('^') ? fragment.slice(1).trim() : trailingBlockMatch?.[1]

  return {
    target,
    label: rawLabel?.trim() || undefined,
    fragment,
    blockId: blockId || undefined,
    heading: fragment && !fragment.startsWith('^') ? fragment : undefined
  }
}

export function selectMarkdownReferenceContent(content: string, reference: Pick<ObsidianLinkReference, 'heading' | 'blockId'>): string {
  if (reference.blockId) return extractMarkdownBlockReference(content, reference.blockId) || content
  if (reference.heading) return extractMarkdownHeadingSection(content, reference.heading) || content
  return content
}

function extractMarkdownHeadingSection(content: string, heading: string): string | null {
  const target = normalizeHeadingText(heading)
  if (!target) return null

  const lines = content.split('\n')
  let start = -1
  let level = 0

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match) continue
    if (normalizeHeadingText(match[2]) === target) {
      start = i
      level = match[1].length
      break
    }
  }

  if (start < 0) return null

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/)
    if (match && match[1].length <= level) {
      end = i
      break
    }
  }

  return lines.slice(start, end).join('\n').trim()
}

function extractMarkdownBlockReference(content: string, blockId: string): string | null {
  const normalized = blockId.replace(/^\^/, '').trim()
  if (!normalized) return null

  const lines = content.split('\n')
  const marker = new RegExp(`(?:^|\\s)\\^${escapeRegExp(normalized)}\\s*$`)
  const markerIndex = lines.findIndex((line) => marker.test(line.trim()))
  if (markerIndex < 0) return null

  let start = markerIndex
  while (start > 0 && lines[start - 1].trim() && !/^#{1,6}\s+/.test(lines[start - 1])) {
    start--
  }

  let end = markerIndex + 1
  while (end < lines.length && lines[end].trim() && !/^#{1,6}\s+/.test(lines[end])) {
    end++
  }

  const block = lines.slice(start, end).join('\n').trim()
  const withoutMarker = block.replace(new RegExp(`\\s*\\^${escapeRegExp(normalized)}\\s*$`), '').trim()
  return withoutMarker || block
}

function normalizeHeadingText(value: string): string {
  return value.replace(/\s+#+$/, '').trim().toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
