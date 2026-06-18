import type { ChatEvidenceReason, ChatEvidenceState, ChatSource } from '@shared/types/ipc'

export function buildChatEvidenceFromSources(sources: ChatSource[]): ChatEvidenceState | undefined {
  if (sources.length === 0) return undefined

  const origins = new Set(sources.flatMap((source) => source.origins || []))
  let reason: ChatEvidenceReason = 'retrieval'
  if (origins.has('local_search')) {
    reason = 'retrieval'
  } else if (origins.has('vault_tool')) {
    reason = 'vault_tool'
  } else if (origins.has('context_pack')) {
    reason = 'context_pack'
  }

  return {
    status: 'local',
    reason,
    sourceCount: sources.length
  }
}
