const MAX_CHAT_DRAFT_CHARS = 12_000

export function getChatDraftStorageKey(vaultPath: string | null | undefined, sessionId: string | null | undefined): string {
  const vaultKey = vaultPath || 'no-vault'
  const sessionKey = sessionId || 'default'
  return `nexusky-chat-draft:${encodeURIComponent(vaultKey)}:${encodeURIComponent(sessionKey)}`
}

export function normalizeChatDraft(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, MAX_CHAT_DRAFT_CHARS)
}
