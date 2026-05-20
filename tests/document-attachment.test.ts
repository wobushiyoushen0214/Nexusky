import { describe, expect, it } from 'vitest'
import { buildDocumentAttachmentContext, createDocumentAttachment, getDocumentExtension, isSupportedAiDocumentName, normalizeDocumentAttachmentText } from '../packages/renderer/src/components/ai/document-attachment'

describe('AI document attachments', () => {
  it('recognizes common office and document file names', () => {
    expect(getDocumentExtension('/tmp/Report.DOCX')).toBe('.docx')
    expect(isSupportedAiDocumentName('brief.doc')).toBe(true)
    expect(isSupportedAiDocumentName('brief.docx')).toBe(true)
    expect(isSupportedAiDocumentName('deck.pdf')).toBe(true)
    expect(isSupportedAiDocumentName('table.xls')).toBe(true)
    expect(isSupportedAiDocumentName('table.xlsx')).toBe(true)
    expect(isSupportedAiDocumentName('image.png')).toBe(false)
  })

  it('normalizes readable document text before adding it to AI context', () => {
    expect(normalizeDocumentAttachmentText('Title\u0000\n\n  First\t\tline  ').text).toBe('Title\nFirst line')
    expect(normalizeDocumentAttachmentText('x'.repeat(25000))).toMatchObject({ truncated: true })
  })

  it('builds AI context from document attachments', () => {
    const attachment = createDocumentAttachment('Report.pdf', 'Important numbers', '/vault/Report.pdf')
    expect(buildDocumentAttachmentContext([attachment])).toContain('[Document: Report.pdf]')
    expect(buildDocumentAttachmentContext([attachment])).toContain('Path: /vault/Report.pdf')
    expect(buildDocumentAttachmentContext([attachment])).toContain('Important numbers')
  })
})
