import { describe, expect, it } from 'vitest'
import { getChatDraftStorageKey, normalizeChatDraft } from '../packages/renderer/src/components/ai/chat-draft'

describe('chat panel draft persistence helpers', () => {
  it('keys unsent drafts by vault and chat session', () => {
    expect(getChatDraftStorageKey('/vault/知识库', 'session:1')).toBe('nexusky-chat-draft:%2Fvault%2F%E7%9F%A5%E8%AF%86%E5%BA%93:session%3A1')
    expect(getChatDraftStorageKey('/vault/知识库', null)).toBe('nexusky-chat-draft:%2Fvault%2F%E7%9F%A5%E8%AF%86%E5%BA%93:default')
    expect(getChatDraftStorageKey(null, null)).toBe('nexusky-chat-draft:no-vault:default')
  })

  it('normalizes missing and very large drafts for storage', () => {
    expect(normalizeChatDraft(null)).toBe('')
    expect(normalizeChatDraft(undefined)).toBe('')
    expect(normalizeChatDraft('继续分析这篇笔记')).toBe('继续分析这篇笔记')
    expect(normalizeChatDraft('x'.repeat(13000))).toHaveLength(12000)
  })
})
