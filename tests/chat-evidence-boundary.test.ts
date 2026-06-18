import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildNoVaultEvidenceSystemPrompt, getNoVaultEvidenceInstruction } from '../packages/main/src/services/ai/system-context'
import { buildChatEvidenceFromSources } from '../packages/renderer/src/components/ai/chat-evidence'
import type { ChatSource } from '../packages/shared/src/types/ipc'

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined
  },
  useTranslation: () => ({
    t: (key: string) => ({
      'chatMessages.noVaultEvidence.title': 'No local source found',
      'chatMessages.noVaultEvidence.detail': 'This answer has no retrieved note or Context Pack citation.'
    })[key] || key
  })
}))

vi.mock('dompurify', () => ({
  default: {
    sanitize: (value: string) => value
  }
}))

vi.mock('@shared/markdown/callouts', () => ({
  renderMarkdownCallouts: (value: string) => value
}), { virtual: true })

vi.mock('@shared/markdown/footnotes', () => ({
  renderMarkdownFootnotes: (value: string) => value
}), { virtual: true })

vi.mock('@shared/markdown/highlights', () => ({
  renderMarkdownHighlights: (value: string) => value
}), { virtual: true })

vi.mock('@shared/markdown/comments', () => ({
  stripMarkdownComments: (value: string) => value
}), { virtual: true })

import { MessageBubble } from '../packages/renderer/src/components/ai/MessageBubble'

function sourceWithOrigins(origins: ChatSource['origins']): ChatSource {
  return {
    title: 'Source',
    filePath: '/vault/source.md',
    chunk: 'chunk',
    score: 1,
    origins
  }
}

describe('chat no-vault-evidence boundary', () => {
  it('adds an English system instruction that separates vault evidence from general knowledge', () => {
    const prompt = buildNoVaultEvidenceSystemPrompt({
      basePrompt: 'Base assistant prompt.',
      language: 'en'
    })

    expect(prompt).toContain('Base assistant prompt.')
    expect(prompt).toContain('No retrieval sources or Context Pack sources were found')
    expect(prompt).toContain('general knowledge')
    expect(prompt).toContain('Do not invent citations')
  })

  it('adds a Chinese system instruction that requires saying local evidence was not found', () => {
    const instruction = getNoVaultEvidenceInstruction('zh-CN')

    expect(instruction).toContain('未在本地笔记中找到相关证据')
    expect(instruction).toContain('通用知识')
    expect(instruction).toContain('不要编造引用')
  })

  it('renders a lightweight no-source notice only for assistant messages marked as no local evidence', () => {
    const html = renderToStaticMarkup(createElement(MessageBubble, {
      msg: {
        id: 'm1',
        role: 'assistant',
        content: 'General answer.',
        evidence: { status: 'none', reason: 'no_vault_sources', sourceCount: 0 }
      }
    }))
    const normalHtml = renderToStaticMarkup(createElement(MessageBubble, {
      msg: {
        id: 'm2',
        role: 'assistant',
        content: 'Regular answer.'
      }
    }))

    expect(html).toContain('No local source found')
    expect(html).toContain('no retrieved note or Context Pack citation')
    expect(normalHtml).not.toContain('No local source found')
  })

  it('classifies local evidence by source origin for persisted chat history', () => {
    expect(buildChatEvidenceFromSources([])).toBeUndefined()
    expect(buildChatEvidenceFromSources([sourceWithOrigins(['context_pack'])])).toEqual({
      status: 'local',
      reason: 'context_pack',
      sourceCount: 1
    })
    expect(buildChatEvidenceFromSources([sourceWithOrigins(['vault_tool'])])).toEqual({
      status: 'local',
      reason: 'vault_tool',
      sourceCount: 1
    })
    expect(buildChatEvidenceFromSources([
      sourceWithOrigins(['context_pack']),
      sourceWithOrigins(['local_search'])
    ])).toEqual({
      status: 'local',
      reason: 'retrieval',
      sourceCount: 2
    })
  })
})
