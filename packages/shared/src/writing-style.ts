export type WritingLanguage = 'zh' | 'en' | 'mixed' | 'unknown'
export type WritingPace = 'short' | 'balanced' | 'long'
export type WritingListStyle = 'dash' | 'asterisk' | 'numbered' | 'mixed' | 'none'
export type WritingHeadingStyle = 'structured' | 'light' | 'none'

export interface WritingStyleProfile {
  language: WritingLanguage
  sentencePace: WritingPace
  paragraphPace: WritingPace
  listStyle: WritingListStyle
  headingStyle: WritingHeadingStyle
  avgSentenceLength: number
  avgParagraphLength: number
  sampleChars: number
  usesCodeBlocks: boolean
  technicalTone: boolean
}

const MIN_STYLE_SAMPLE_CHARS = 40

function clampSample(text: string): string {
  return text.replace(/\r\n/g, '\n').trim().slice(-12000)
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length || 0
}

function detectLanguage(text: string): WritingLanguage {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]+`/g, ' ')
  const zh = countMatches(prose, /[\u4e00-\u9fff]/g)
  const en = countMatches(prose, /[A-Za-z]/g)
  if (zh === 0 && en === 0) return 'unknown'
  if (zh > 0 && en > 0 && zh < en * 0.2) return 'mixed'
  if (zh > 0 && en > 0 && en < zh * 0.2) return 'zh'
  if (zh > 0 && en > 0 && zh > en * 0.45) return 'zh'
  if (zh > 0 && en > 0 && en > zh * 0.45) return 'en'
  if (zh > 0 && en > 0) return 'mixed'
  return zh >= en ? 'zh' : 'en'
}

function toPace(avg: number, language: WritingLanguage): WritingPace {
  const shortLimit = language === 'en' ? 55 : 28
  const longLimit = language === 'en' ? 120 : 70
  if (avg <= shortLimit) return 'short'
  if (avg >= longLimit) return 'long'
  return 'balanced'
}

function detectListStyle(text: string): WritingListStyle {
  const dash = countMatches(text, /^ {0,3}-\s+/gm)
  const asterisk = countMatches(text, /^ {0,3}\*\s+/gm)
  const numbered = countMatches(text, /^ {0,3}\d+[.)]\s+/gm)
  const active = [
    dash > 0 ? 'dash' : '',
    asterisk > 0 ? 'asterisk' : '',
    numbered > 0 ? 'numbered' : ''
  ].filter(Boolean)
  if (active.length === 0) return 'none'
  if (active.length > 1) return 'mixed'
  return active[0] as WritingListStyle
}

function detectHeadingStyle(text: string, paragraphCount: number): WritingHeadingStyle {
  const headings = countMatches(text, /^#{1,4}\s+\S+/gm)
  if (headings === 0) return 'none'
  return headings >= 3 || headings / Math.max(paragraphCount, 1) >= 0.18 ? 'structured' : 'light'
}

export function analyzeWritingStyle(samples: string | string[]): WritingStyleProfile {
  const text = clampSample(Array.isArray(samples) ? samples.filter(Boolean).join('\n\n') : samples)
  const language = detectLanguage(text)
  const sentences = text
    .split(/[。！？!?]+|(?<=[A-Za-z0-9][.!?])\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
  const sentenceLengths = sentences.map((sentence) => sentence.replace(/\s/g, '').length)
  const paragraphLengths = paragraphs.map((paragraph) => paragraph.replace(/\s/g, '').length)
  const avgSentenceLength = sentenceLengths.length
    ? Math.round(sentenceLengths.reduce((sum, length) => sum + length, 0) / sentenceLengths.length)
    : 0
  const avgParagraphLength = paragraphLengths.length
    ? Math.round(paragraphLengths.reduce((sum, length) => sum + length, 0) / paragraphLengths.length)
    : 0
  const technicalTone = /```|`[^`]+`|\b(API|SDK|HTTP|JSON|SQL|React|Electron|TypeScript|CLI)\b|接口|函数|组件|数据库|索引/.test(text)

  return {
    language,
    sentencePace: toPace(avgSentenceLength, language),
    paragraphPace: toPace(avgParagraphLength, language),
    listStyle: detectListStyle(text),
    headingStyle: detectHeadingStyle(text, paragraphs.length),
    avgSentenceLength,
    avgParagraphLength,
    sampleChars: text.length,
    usesCodeBlocks: /```/.test(text),
    technicalTone
  }
}

export function formatWritingStylePrompt(profile: WritingStyleProfile): string {
  if (profile.sampleChars < MIN_STYLE_SAMPLE_CHARS || profile.language === 'unknown') return ''

  const languageLabel: Record<WritingLanguage, string> = {
    zh: '中文',
    en: 'English',
    mixed: '中英混合',
    unknown: '未知'
  }
  const paceLabel: Record<WritingPace, string> = {
    short: '短句为主',
    balanced: '中等句长',
    long: '长句/复合句较多'
  }
  const listLabel: Record<WritingListStyle, string> = {
    dash: '使用 - 列表',
    asterisk: '使用 * 列表',
    numbered: '使用编号列表',
    mixed: '列表符号混合',
    none: '很少使用列表'
  }
  const headingLabel: Record<WritingHeadingStyle, string> = {
    structured: '标题层级清晰',
    light: '少量标题',
    none: '很少使用标题'
  }

  return [
    '写作风格画像:',
    `- 语言: ${languageLabel[profile.language]}`,
    `- 句子节奏: ${paceLabel[profile.sentencePace]}，平均约 ${profile.avgSentenceLength} 字符`,
    `- 段落节奏: ${paceLabel[profile.paragraphPace]}，平均约 ${profile.avgParagraphLength} 字符`,
    `- 结构习惯: ${headingLabel[profile.headingStyle]}，${listLabel[profile.listStyle]}`,
    `- 内容气质: ${profile.technicalTone ? '偏技术/说明型' : '偏自然叙述型'}${profile.usesCodeBlocks ? '，会使用代码块' : ''}`,
    '生成或改写时优先贴近上述风格，但不要机械复刻，也不要说明你在模仿风格。'
  ].join('\n')
}
