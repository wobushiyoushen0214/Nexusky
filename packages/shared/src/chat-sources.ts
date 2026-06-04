import type { ChatSource, ChatSourceOrigin } from './types/ipc'

function mergeOrigins(a?: ChatSourceOrigin[], b?: ChatSourceOrigin[]): ChatSourceOrigin[] | undefined {
  const origins = [...(a || []), ...(b || [])].filter(Boolean)
  const unique = Array.from(new Set(origins))
  return unique.length > 0 ? unique : undefined
}

export function mergeChatSources(...groups: (ChatSource[] | undefined)[]): ChatSource[] {
  const sources: ChatSource[] = []
  for (const group of groups) {
    for (const source of group || []) {
      const existing = sources.find((item) => item.filePath === source.filePath && item.title === source.title)
      if (!existing) {
        sources.push({ ...source, origins: mergeOrigins(source.origins) })
        continue
      }
      existing.origins = mergeOrigins(existing.origins, source.origins)
      existing.score = Math.max(existing.score, source.score)
      if (!existing.explanation && source.explanation) existing.explanation = source.explanation
      if (!existing.relationType && source.relationType) existing.relationType = source.relationType
      if (!existing.memoryTier && source.memoryTier) existing.memoryTier = source.memoryTier
      if (!existing.evidence?.length && source.evidence?.length) existing.evidence = source.evidence
      if (source.origins?.includes('local_search') || !existing.chunk) existing.chunk = source.chunk
    }
  }
  return sources
}
