import { safeSet } from '../../utils/storage'
import type { TFunction } from 'i18next'

export interface AICommandDraft {
  prompt: string
  mode?: 'chat' | 'edit'
  agentMode?: boolean
  attachSelection?: boolean
  unboundEdit?: boolean
  requiresCurrentNote?: boolean
}

export interface ChatHint {
  id: string
  title: string
  detail: string
  mark: string
  draft?: AICommandDraft
  event?: 'mention' | 'graph'
}

export const PENDING_AI_DRAFT_STORAGE_KEY = 'nexusky-pending-ai-draft'

export function queueAiCommandDraft(draft: AICommandDraft, openChat: () => void) {
  safeSet(PENDING_AI_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  openChat()
  window.dispatchEvent(new CustomEvent('ai-command-draft', { detail: draft }))
}

export function buildChatHints(t: TFunction): ChatHint[] {
  return [
    {
      id: 'cited-vault-question',
      title: t('chatMessages.hints.citedVaultQuestion.title'),
      detail: t('chatMessages.hints.citedVaultQuestion.detail'),
      mark: 'AI',
      draft: { mode: 'chat', agentMode: false, prompt: t('chatMessages.hints.citedVaultQuestion.prompt') }
    },
    {
      id: 'edit-current-note',
      title: t('chatMessages.hints.editCurrent.title'),
      detail: t('chatMessages.hints.editCurrent.detail'),
      mark: 'ED',
      draft: { mode: 'edit', requiresCurrentNote: true, prompt: t('chatMessages.hints.editCurrent.prompt') }
    },
    {
      id: 'rewrite-selection',
      title: t('chatMessages.hints.rewriteSelection.title'),
      detail: t('chatMessages.hints.rewriteSelection.detail'),
      mark: 'SE',
      draft: { mode: 'edit', attachSelection: true, prompt: t('chatMessages.hints.rewriteSelection.prompt') }
    },
    {
      id: 'batch-linked-notes',
      title: t('chatMessages.hints.batchNotes.title'),
      detail: t('chatMessages.hints.batchNotes.detail'),
      mark: 'KB',
      draft: { mode: 'edit', unboundEdit: true, prompt: t('chatMessages.hints.batchNotes.prompt') }
    },
    {
      id: 'generate-graph',
      title: t('chatMessages.hints.generateGraph.title'),
      detail: t('chatMessages.hints.generateGraph.detail'),
      mark: 'KG',
      event: 'graph'
    },
    {
      id: 'mention-note',
      title: t('chatMessages.hints.mentionNote.title'),
      detail: t('chatMessages.hints.mentionNote.detail'),
      mark: '@',
      event: 'mention'
    }
  ]
}
