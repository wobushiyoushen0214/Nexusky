export function buildGeneratedNoteSystemPrompt(): string {
  return `你是一个知识库笔记写作助手。请根据标题和描述，写一篇结构清晰的 Markdown 笔记。

规则：
1. 第一行必须是 # 标题，标题必须和给定的标题完全一致
2. 必须使用 [[双向链接]] 连接同批次中最相关的 2-4 篇笔记，只能链接给定的其他笔记标题
3. 双向链接要自然放在正文语境中，也可以在文末添加“## 相关笔记”小节
4. 内容包含分节、要点，结构清晰
5. 不要编造未给出的笔记标题作为 wikilink
6. 只输出 Markdown 内容，不要其他解释`
}

export function buildGeneratedNoteUserPrompt(title: string, brief: string, siblingTitles: string[]): string {
  const siblingList = siblingTitles.length > 0
    ? siblingTitles.map((name) => `- ${name}`).join('\n')
    : '- 无'

  return `标题: ${title}
描述: ${brief}

同批次可链接的其他笔记标题（需要从中选择 2-4 个自然写成 [[标题]]）:
${siblingList}`
}

function hasWikilinkToTitle(content: string, title: string): boolean {
  return content.includes(`[[${title}]]`) || content.includes(`[[${title}|`)
}

function serializeYamlString(value: string): string {
  return JSON.stringify(value)
}

function serializeYamlList(values: string[]): string[] {
  return values.map((value) => `  - ${serializeYamlString(value)}`)
}

export function ensureGeneratedNoteMetadata(content: string, title: string, summary: string): string {
  const trimmed = content.trim()
  if (!trimmed || trimmed.startsWith('---\n') || trimmed.startsWith('---\r\n')) return trimmed

  const frontmatter = [
    '---',
    `title: ${serializeYamlString(title)}`,
    ...(summary.trim() ? [`summary: ${serializeYamlString(summary.trim())}`] : []),
    'tags:',
    ...serializeYamlList(['ai-generated', 'batch-note']),
    'status: seed',
    'source: ai-batch',
    '---'
  ]

  return `${frontmatter.join('\n')}\n${trimmed}`
}

export function ensureGeneratedNoteWikilinks(content: string, currentTitle: string, siblingTitles: string[], maxLinks = 4): string {
  const trimmed = content.trim()
  if (!trimmed) return trimmed

  const candidates = siblingTitles
    .filter((title) => title && title !== currentTitle)
    .slice(0, maxLinks)
  const missingLinks = candidates.filter((title) => !hasWikilinkToTitle(trimmed, title))

  if (missingLinks.length === 0) return trimmed

  return `${trimmed}\n\n## 相关笔记\n\n${missingLinks.map((title) => `- [[${title}]]`).join('\n')}`
}
