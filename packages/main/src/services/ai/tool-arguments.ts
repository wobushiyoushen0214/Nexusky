import { extractJsonFromText } from './json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseToolArguments(raw: string): { args: Record<string, unknown>; error?: string } {
  try {
    const parsed = extractJsonFromText(raw)
    if (!isRecord(parsed)) {
      return { args: {}, error: '工具参数必须是 JSON 对象。' }
    }
    return { args: parsed }
  } catch {
    return { args: {}, error: `工具参数不是有效 JSON: ${raw.slice(0, 200)}` }
  }
}
