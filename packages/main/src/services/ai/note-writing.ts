import type { AppLanguage } from '@shared/types/ipc'
import { getAiOutputLanguageInstruction } from './language'

export function buildGeneratedNoteSystemPrompt(language: AppLanguage = 'zh-CN'): string {
  return `你是一个知识库笔记写作助手。请根据标题和描述，写一篇结构清晰的 Markdown 笔记。

规则：
1. 第一行必须是 # 标题，标题必须和给定的标题完全一致
2. 如果正文自然涉及同批次的其他笔记主题，可以用 [[标题]] 引用；如果没有自然关联，不要为了加链接而加
3. 链接必须使用给定的笔记标题，不要编造未给出的标题作为 wikilink
4. 不要在末尾追加“相关笔记”“延伸阅读”这类罗列链接的小节
5. 内容包含分节、要点，结构清晰
6. 只输出 Markdown 内容，不要其他解释

${getAiOutputLanguageInstruction(language)}`
}

export function buildGeneratedNoteUserPrompt(title: string, brief: string, siblingTitles: string[]): string {
  const siblingList = siblingTitles.length > 0
    ? siblingTitles.map((name) => `- ${name}`).join('\n')
    : '- 无'

  return `标题: ${title}
描述: ${brief}

同批次的其他笔记标题（仅在正文自然涉及时引用为 [[标题]]，否则忽略）:
${siblingList}`
}

function serializeYamlString(value: string): string {
  return JSON.stringify(value)
}

function serializeYamlList(values: string[]): string[] {
  return values.map((value) => `  - ${serializeYamlString(value)}`)
}

export function ensureGeneratedNoteMetadata(content: string, title: string, summary: string, relatedTitles: string[] = []): string {
  const trimmed = content.trim()
  if (!trimmed || trimmed.startsWith('---\n') || trimmed.startsWith('---\r\n')) return trimmed
  const related = Array.from(new Set(relatedTitles.map((item) => item.trim()).filter((item) => item && item !== title))).slice(0, 8)

  const frontmatter = [
    '---',
    `title: ${serializeYamlString(title)}`,
    ...(summary.trim() ? [`summary: ${serializeYamlString(summary.trim())}`] : []),
    ...(related.length > 0 ? ['related:', ...serializeYamlList(related)] : []),
    'tags:',
    ...serializeYamlList(['ai-generated', 'batch-note']),
    'status: seed',
    'source: ai-batch',
    '---'
  ]

  return `${frontmatter.join('\n')}\n${trimmed}`
}
