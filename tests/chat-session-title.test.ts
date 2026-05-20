import { describe, expect, it } from 'vitest'
import { buildChatSessionTitleFromPrompt, shouldAutoRenameChatSession } from '../packages/renderer/src/components/ai/chat-session-title'

describe('chat session title helpers', () => {
  it('builds compact session titles from the first prompt', () => {
    expect(buildChatSessionTitleFromPrompt('  # 请分析 [[AI 工作流]] 的长期风险  ')).toBe('请分析 AI 工作流 的长期风险')
    expect(buildChatSessionTitleFromPrompt('')).toBe('新对话')
    expect(buildChatSessionTitleFromPrompt('x'.repeat(40))).toBe(`${'x'.repeat(27)}…`)
  })

  it('renames only untouched default session titles', () => {
    expect(shouldAutoRenameChatSession('对话 3', 0)).toBe(true)
    expect(shouldAutoRenameChatSession('', 0)).toBe(true)
    expect(shouldAutoRenameChatSession('项目复盘', 0)).toBe(false)
    expect(shouldAutoRenameChatSession('对话 3', 2)).toBe(false)
  })
})
