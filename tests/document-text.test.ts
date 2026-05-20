import { deflateRawSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { extractDocxText, extractDocumentTextFromBuffer, extractPdfText, extractXlsxText, extractZipEntries } from '../packages/main/src/services/document-text'

function makeZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  let index = 0

  for (const [name, text] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name)
    const data = deflateRawSync(Buffer.from(text))
    const local = Buffer.alloc(30 + nameBuffer.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(Buffer.byteLength(text), 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    nameBuffer.copy(local, 30)
    localParts.push(local, data)

    const central = Buffer.alloc(46 + nameBuffer.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(Buffer.byteLength(text), 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)
    nameBuffer.copy(central, 46)
    centralParts.push(central)

    offset += local.length + data.length
    index++
  }

  const central = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(index, 8)
  eocd.writeUInt16LE(index, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, central, eocd])
}

describe('document text extraction', () => {
  it('extracts selected entries from zip office files', () => {
    const zip = makeZip({
      'word/document.xml': '<w:document><w:t>Hello &amp; Nexusky</w:t></w:document>',
      'ignored.xml': '<t>Ignore me</t>'
    })

    expect(extractZipEntries(zip, (name) => name.startsWith('word/'))).toHaveLength(1)
    expect(extractDocxText(zip)).toContain('Hello & Nexusky')
  })

  it('extracts worksheet and shared string text from xlsx files', () => {
    const xlsx = makeZip({
      'xl/sharedStrings.xml': '<sst><si><t>Revenue</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c><v>42</v></c></row></sheetData></worksheet>'
    })

    expect(extractXlsxText(xlsx)).toContain('Revenue')
    expect(extractXlsxText(xlsx)).toContain('42')
  })

  it('extracts simple pdf text and normalizes document output', () => {
    const pdf = Buffer.from('%PDF\nBT (Quarterly report) Tj <48656c6c6f> ET')

    expect(extractPdfText(pdf)).toContain('Quarterly report')
    expect(extractPdfText(pdf)).toContain('Hello')
    expect(extractDocumentTextFromBuffer('/vault/report.pdf', pdf)).toMatchObject({
      name: 'report.pdf',
      method: 'pdf',
      text: expect.stringContaining('Quarterly report')
    })
  })
})
