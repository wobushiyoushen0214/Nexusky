import type { TFunction } from 'i18next'
import type { AICommandDraft } from '../ai/ai-command-draft'
import type { GraphMaintenanceFocus, GraphMaintenanceSignals } from './graph-types'

export type GraphMaintenanceChatFocus = Exclude<GraphMaintenanceFocus, 'all'>

interface GraphMaintenanceChatSignal {
  count: number
  samples: string[]
}

export function getGraphMaintenanceChatSignal(
  focus: GraphMaintenanceChatFocus,
  signals: GraphMaintenanceSignals,
): GraphMaintenanceChatSignal {
  if (focus === 'orphans') {
    return {
      count: signals.orphanNoteCount,
      samples: signals.orphanSamples,
    }
  }
  if (focus === 'bridges') {
    return {
      count: signals.crossFolderBridgeCount,
      samples: signals.crossFolderBridgeSamples,
    }
  }
  return {
    count: signals.inferredRelationCount,
    samples: signals.inferredRelationSamples,
  }
}

export function buildGraphMaintenanceChatDraft(params: {
  focus: GraphMaintenanceChatFocus
  signals: GraphMaintenanceSignals
  t: TFunction
}): AICommandDraft | null {
  const signal = getGraphMaintenanceChatSignal(params.focus, params.signals)
  if (signal.count <= 0) return null

  const samples = signal.samples.slice(0, 3).join(', ') || params.t('graph.maintenance.chatDraft.noSamples')
  return {
    mode: 'chat',
    agentMode: false,
    prompt: params.t(`graph.maintenance.chatDraft.${params.focus}.prompt`, {
      count: signal.count,
      samples,
    })
  }
}
