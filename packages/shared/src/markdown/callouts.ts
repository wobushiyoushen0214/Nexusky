export interface MarkdownCallout {
  type: string
  title: string
  body: string
}

const CALLOUT_PATTERN = /^>\s*\[!([A-Za-z][A-Za-z0-9_-]*)(?:[+-])?\]\s*(.*)$/

export function parseMarkdownCallouts(markdown: string): MarkdownCallout[] {
  const lines = markdown.split(/\r?\n/)
  const callouts: MarkdownCallout[] = []

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(CALLOUT_PATTERN)
    if (!match) continue

    const type = normalizeCalloutType(match[1])
    const bodyLines: string[] = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const bodyMatch = lines[cursor].match(/^>\s?(.*)$/)
      if (!bodyMatch) break
      bodyLines.push(bodyMatch[1])
      cursor++
    }

    callouts.push({
      type,
      title: match[2].trim() || getDefaultCalloutTitle(type),
      body: bodyLines.join('\n').trim()
    })
    index = cursor - 1
  }

  return callouts
}

export function renderMarkdownCallouts(markdown: string): string {
  const lines = markdown.split(/(\r\n|\n|\r)/)
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index] || ''
    const ending = lines[index + 1] || ''
    const match = line.match(CALLOUT_PATTERN)
    if (!match) {
      output.push(line, ending)
      continue
    }

    const type = normalizeCalloutType(match[1])
    const bodyLines: string[] = []
    let cursor = index + 2
    while (cursor < lines.length) {
      const bodyLine = lines[cursor] || ''
      const bodyMatch = bodyLine.match(/^>\s?(.*)$/)
      if (!bodyMatch) break
      bodyLines.push(bodyMatch[1])
      cursor += 2
    }

    output.push(formatCalloutHtml({
      type,
      title: match[2].trim() || getDefaultCalloutTitle(type),
      body: bodyLines.join('\n').trim()
    }), ending)
    index = cursor - 2
  }

  return output.join('')
}

function formatCalloutHtml(callout: MarkdownCallout): string {
  const body = callout.body
    ? `\n<div class="callout-body">${escapeHtml(callout.body).replace(/\n/g, '<br>')}</div>`
    : ''
  return `<aside class="callout callout-${callout.type}" data-callout="${callout.type}">\n<div class="callout-title">${escapeHtml(callout.title)}</div>${body}\n</aside>`
}

function normalizeCalloutType(type: string): string {
  return type.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'note'
}

function getDefaultCalloutTitle(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return entities[char]
  })
}
