import type { TFunction } from 'i18next'
import type { VaultHealthSummary } from '@shared/types/ipc'
import type { AICommandDraft } from '../components/ai/ai-command-draft'

export type VaultHealthNextStepId =
  | 'askAi'
  | 'fixLinks'
  | 'reviewStructure'
  | 'reviewTasks'
  | 'reviewMemory'
  | 'reviewStale'
  | 'browseGraph'

export interface VaultHealthNextStep {
  id: VaultHealthNextStepId
  count?: number
  priority: number
}

export type PendingGraphMaintenanceFocus = 'all' | 'orphans' | 'bridges' | 'inferred'

export type VaultHealthActionTarget =
  | { kind: 'chat'; draft: AICommandDraft }
  | { kind: 'graph'; focus: PendingGraphMaintenanceFocus }

type SignalFactorId = 'links' | 'tasks' | 'memory' | 'structure' | 'freshness'

function promptStats(summary: VaultHealthSummary | null) {
  return {
    notes: summary?.noteCount ?? 0,
    links: summary?.linkCount ?? 0,
    unresolved: summary?.unresolvedLinkCount ?? 0,
    orphans: summary?.orphanCount ?? 0,
    duplicates: summary?.duplicateTitleCount ?? 0,
    tasks: summary?.openTaskCount ?? 0,
    missingMemory: summary?.missingMemoryCount ?? 0,
    stale: summary?.staleNoteCount ?? 0,
  }
}

function chatDraft(prompt: string): AICommandDraft {
  return {
    mode: 'chat',
    agentMode: false,
    prompt,
  }
}

export function buildVaultHealthAskAiDraft(t: TFunction, summary: VaultHealthSummary | null): AICommandDraft {
  return chatDraft(t('vaultHealth.action.askAi.prompt', promptStats(summary)))
}

export function buildVaultHealthNextSteps(summary: VaultHealthSummary): VaultHealthNextStep[] {
  const factorImpact = new Map(summary.scoreFactors.map((factor) => [factor.id, factor.impact]))
  const signalSteps: VaultHealthNextStep[] = []
  const addSignal = (id: VaultHealthNextStepId, count: number, factorId: SignalFactorId) => {
    if (count <= 0) return
    signalSteps.push({
      id,
      count,
      priority: (factorImpact.get(factorId) ?? 0) * 1000 + count,
    })
  }

  addSignal('fixLinks', summary.unresolvedLinkCount, 'links')
  addSignal('reviewStructure', summary.orphanCount + summary.duplicateTitleCount, 'structure')
  addSignal('reviewTasks', summary.openTaskCount, 'tasks')
  addSignal('reviewMemory', summary.missingMemoryCount, 'memory')
  addSignal('reviewStale', summary.staleNoteCount, 'freshness')

  const sortedSignals = signalSteps.sort((a, b) => b.priority - a.priority).slice(0, 3)
  const fallbackSteps: VaultHealthNextStep[] = [
    { id: 'askAi', priority: 0 },
    { id: 'browseGraph', priority: 0 },
  ]
  return [...sortedSignals, ...fallbackSteps.filter((step) => !sortedSignals.some((signal) => signal.id === step.id))]
    .slice(0, 3)
}

export function buildVaultHealthActionTarget(
  id: VaultHealthNextStepId,
  t: TFunction,
  summary: VaultHealthSummary | null,
): VaultHealthActionTarget {
  if (id === 'browseGraph') return { kind: 'graph', focus: 'all' }
  if (id === 'reviewStructure' && (summary?.orphanCount ?? 0) > 0) {
    return { kind: 'graph', focus: 'orphans' }
  }
  if (id === 'askAi') {
    return { kind: 'chat', draft: buildVaultHealthAskAiDraft(t, summary) }
  }

  return {
    kind: 'chat',
    draft: chatDraft(t(`vaultHealth.action.${id}.prompt`, promptStats(summary))),
  }
}
