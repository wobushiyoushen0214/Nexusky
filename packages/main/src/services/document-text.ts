import { basename, extname } from 'path'
import { inflateRawSync } from 'zlib'

const MAX_DOCUMENT_TEXT_CHARS = 120_000

export interface ExtractedDocumentText {
  name: string
  path: string
  text: string
  truncated: boolean
  method: 'text' | 'docx' | 'xlsx' | 'pdf' | 'binary'
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
}

function normalizeText(value: string): { text: string; truncated: boolean } {
  const text = value
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\uFFFD+/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()

  if (text.length <= MAX_DOCUMENT_TEXT_CHARS) return { text, truncated: false }
  return { text: text.slice(0, MAX_DOCUMENT_TEXT_CHARS), truncated: true }
}

function xmlToText(xml: string): string {
  return decodeXmlEntities(xml
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n{3,}/g, '\n\n'))
}

interface ZipEntry {
  name: string
  content: Buffer
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 66000)
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  return -1
}

export function extractZipEntries(buffer: Buffer, include: (name: string) => boolean): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) return []
  const total = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []

  for (let index = 0; index < total && offset + 46 <= buffer.length; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf-8')

    if (include(name) && localOffset + 30 <= buffer.length && buffer.readUInt32LE(localOffset) === 0x04034b50) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength
      const data = buffer.slice(dataOffset, dataOffset + compressedSize)
      try {
        const content = method === 0 ? data : method === 8 ? inflateRawSync(data) : Buffer.alloc(0)
        if (content.length > 0) entries.push({ name, content })
      } catch {}
    }

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

export function extractDocxText(buffer: Buffer): string {
  const entries = extractZipEntries(buffer, (name) => (
    name === 'word/document.xml' ||
    /^word\/(header|footer)\d+\.xml$/.test(name) ||
    name === 'word/footnotes.xml' ||
    name === 'word/endnotes.xml'
  ))
  return entries.map((entry) => xmlToText(entry.content.toString('utf-8'))).join('\n\n')
}

export function extractXlsxText(buffer: Buffer): string {
  const entries = extractZipEntries(buffer, (name) => (
    name === 'xl/sharedStrings.xml' ||
    /^xl\/worksheets\/sheet\d+\.xml$/.test(name)
  ))
  return entries.map((entry) => xmlToText(entry.content.toString('utf-8'))).join('\n\n')
}

function decodePdfEscapes(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
}

export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1')
  const parts: string[] = []
  for (const match of raw.matchAll(/\((?:\\.|[^\\)]){2,}\)/g)) {
    parts.push(decodePdfEscapes(match[0].slice(1, -1)))
  }
  for (const match of raw.matchAll(/<([0-9a-fA-F]{4,})>/g)) {
    const hex = match[1]
    if (hex.length % 2 !== 0) continue
    const bytes = Buffer.from(hex, 'hex')
    const utf16 = bytes.length >= 2 && ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0xff && bytes[1] === 0xfe))
    parts.push(bytes.toString(utf16 ? 'utf16le' : 'utf-8'))
  }
  return parts.join('\n')
}

function extractBinaryStrings(buffer: Buffer): string {
  const latin = buffer.toString('latin1').match(/[ -~\u00a0-\u00ff]{4,}/g) || []
  const utf16 = buffer.toString('utf16le').match(/[\p{L}\p{N}\p{P}\p{Zs}]{4,}/gu) || []
  return [...latin, ...utf16].join('\n')
}

export function extractDocumentTextFromBuffer(path: string, buffer: Buffer): ExtractedDocumentText {
  const ext = extname(path).toLowerCase()
  const name = basename(path)
  const method: ExtractedDocumentText['method'] = ext === '.docx'
    ? 'docx'
    : ext === '.xlsx'
      ? 'xlsx'
      : ext === '.pdf'
        ? 'pdf'
        : ['.txt', '.md', '.csv', '.tsv', '.rtf'].includes(ext)
          ? 'text'
          : 'binary'
  const raw = method === 'docx'
    ? extractDocxText(buffer)
    : method === 'xlsx'
      ? extractXlsxText(buffer)
      : method === 'pdf'
        ? extractPdfText(buffer)
        : method === 'text'
          ? buffer.toString('utf-8')
          : extractBinaryStrings(buffer)
  const normalized = normalizeText(raw)
  return { name, path, text: normalized.text, truncated: normalized.truncated, method }
}
