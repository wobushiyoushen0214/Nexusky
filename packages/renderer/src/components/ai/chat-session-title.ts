const MAX_CHAT_SESSION_TITLE_CHARS = 28

export function buildChatSessionTitleFromPrompt(prompt: string): string {
  const compact = prompt
    .replace(/[#*_`>\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!compact) return '新对话'
  return compact.length > MAX_CHAT_SESSION_TITLE_CHARS
    ? `${compact.slice(0, MAX_CHAT_SESSION_TITLE_CHARS - 1)}…`
    : compact
}

export function shouldAutoRenameChatSession(title: string | null | undefined, messageCount: number): boolean {
  if (messageCount > 0) return false
  if (!title || !title.trim()) return true
  return /^对话\s+\d+$/.test(title.trim())
}
