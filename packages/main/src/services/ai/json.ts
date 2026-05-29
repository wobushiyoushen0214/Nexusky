type JsonRoot = 'object' | 'array'

function matchesRoot(value: unknown, root?: JsonRoot): boolean {
  if (!root) return true
  return root === 'array'
    ? Array.isArray(value)
    : value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collectBalancedJsonCandidates(text: string): string[] {
  const candidates: string[] = []
  const starts = new Set(['{', '['])

  for (let start = 0; start < text.length; start++) {
    if (!starts.has(text[start])) continue

    const stack: string[] = []
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (ch === '\\') {
          escaped = true
        } else if (ch === '"') {
          inString = false
        }
        continue
      }

      if (ch === '"') {
        inString = true
      } else if (ch === '{' || ch === '[') {
        stack.push(ch)
      } else if (ch === '}' || ch === ']') {
        const expected = ch === '}' ? '{' : '['
        if (stack.pop() !== expected) break
        if (stack.length === 0) {
          candidates.push(text.slice(start, i + 1))
          break
        }
      }
    }
  }

  return candidates
}

function collectRepairableJsonCandidates(text: string): string[] {
  const candidates: string[] = []
  const starts = new Set(['{', '['])

  for (let start = 0; start < text.length; start++) {
    if (!starts.has(text[start])) continue

    const stack: string[] = []
    let inString = false
    let escaped = false
    let invalid = false

    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (ch === '\\') {
          escaped = true
        } else if (ch === '"') {
          inString = false
        }
        continue
      }

      if (ch === '"') {
        inString = true
      } else if (ch === '{' || ch === '[') {
        stack.push(ch)
      } else if (ch === '}' || ch === ']') {
        const expected = ch === '}' ? '{' : '['
        if (stack.pop() !== expected) {
          invalid = true
          break
        }
        if (stack.length === 0) break
      }
    }

    if (invalid || stack.length === 0) continue
    const suffix = [
      inString ? '"' : '',
      ...stack.slice().reverse().map((ch) => ch === '{' ? '}' : ']')
    ].join('')
    candidates.push(text.slice(start).trimEnd() + suffix)
  }

  return candidates
}

export function extractJsonFromText<T = unknown>(text: string, root?: JsonRoot): T {
  const trimmed = text.trim()
  const candidates: string[] = []

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/gi) || []
  for (const block of fenced) {
    candidates.push(block.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  }

  candidates.push(
    trimmed,
    ...collectRepairableJsonCandidates(trimmed),
    ...collectBalancedJsonCandidates(trimmed)
  )

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as T
      if (matchesRoot(parsed, root)) return parsed
    } catch {}
  }

  throw new Error('AI 未返回有效的 JSON')
}
