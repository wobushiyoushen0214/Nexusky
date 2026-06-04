import type { ChatSource } from '@shared/types/ipc'

export function getChatSourceProvenance(source: ChatSource): {
  originLabelKey: string | null
  hasContextPack: boolean
  explanation: string
  evidence: string[]
} {
  const origins = source.origins || []
  const hasLocalSearch = origins.includes('local_search')
  const hasContextPack = origins.includes('context_pack')
  const hasVaultTool = origins.includes('vault_tool')
  const originLabelKey = hasLocalSearch && hasContextPack
    ? 'citationLookup.origin.blended'
    : hasContextPack
      ? 'citationLookup.origin.contextPack'
      : hasLocalSearch
        ? 'citationLookup.origin.localSearch'
        : hasVaultTool
          ? 'citationLookup.origin.vaultTool'
          : null
  const explanation = hasContextPack
    ? (source.explanation || source.chunk || '').trim()
    : ''

  return {
    originLabelKey,
    hasContextPack,
    explanation,
    evidence: hasContextPack ? (source.evidence || []).map((item) => item.trim()).filter(Boolean).slice(0, 2) : []
  }
}
