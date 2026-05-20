const MAX_DOCUMENT_CONTEXT_CHARS = 24_000

const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.pdf',
  '.xls',
  '.xlsx',
  '.csv',
  '.tsv',
  '.txt',
  '.rtf'
])

export interface AiDocumentAttachment {
  name: string
  path?: string
  text: string
  truncated: boolean
}

export function getDocumentExtension(name: string): string {
  const match = name.toLowerCase().match(/\.[^.\\/]+$/)
  return match?.[0] || ''
}

export function isSupportedAiDocumentName(name: string): boolean {
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(getDocumentExtension(name))
}

export function normalizeDocumentAttachmentText(raw: string): { text: string; truncated: boolean } {
  const readable = raw
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\uFFFD+/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()

  if (!readable) return { text: '', truncated: false }
  if (readable.length <= MAX_DOCUMENT_CONTEXT_CHARS) return { text: readable, truncated: false }
  return { text: readable.slice(0, MAX_DOCUMENT_CONTEXT_CHARS), truncated: true }
}

export function createDocumentAttachment(name: string, rawText: string, path?: string): AiDocumentAttachment {
  const normalized = normalizeDocumentAttachmentText(rawText)
  return {
    name,
    path,
    text: normalized.text,
    truncated: normalized.truncated
  }
}

export function buildDocumentAttachmentContext(documents: AiDocumentAttachment[]): string {
  return documents.map((doc) => {
    const pathLine = doc.path ? `\nPath: ${doc.path}` : ''
    const truncatedLine = doc.truncated ? '\nNote: content was truncated before sending.' : ''
    const body = doc.text || 'No readable text could be extracted. Use the filename and available metadata only.'
    return `[Document: ${doc.name}]${pathLine}${truncatedLine}\n${body}`
  }).join('\n\n')
}
