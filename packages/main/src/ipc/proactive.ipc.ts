import { BrowserWindow, ipcMain } from 'electron'
import {
  listSuggestions,
  updateStatus,
  type ProactiveSuggestionRow
} from '../services/proactive/proactive-store'
import {
  getProactivePrefs,
  setProactivePrefs
} from '../services/proactive/proactive-prefs'
import { runProactiveCycle } from '../services/proactive/proactive-orchestrator'
import {
  subscribeProactiveEmitted,
  type ProactiveEmittedListener
} from '../services/proactive/proactive-broadcaster'
import type {
  ProactiveSuggestion,
  ProactiveSuggestionStatus,
  ProactiveEntityType,
  ProactiveTriggerKind,
  ProactiveUserPrefs
} from '@shared/types/ipc'

function toIpc(row: ProactiveSuggestionRow): ProactiveSuggestion {
  return row as unknown as ProactiveSuggestion
}

function emitToAllWindows(suggestion: ProactiveSuggestionRow): void {
  const payload = toIpc(suggestion)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('proactive:emitted', payload)
    }
  }
}

let unsubscribeBroadcaster: (() => void) | null = null

export function registerProactiveIPC(): void {
  if (unsubscribeBroadcaster) {
    unsubscribeBroadcaster()
    unsubscribeBroadcaster = null
  }
  const listener: ProactiveEmittedListener = (suggestion) => emitToAllWindows(suggestion)
  unsubscribeBroadcaster = subscribeProactiveEmitted(listener)

  ipcMain.handle('proactive:list', async (_event, params: {
    vaultPath: string
    status?: ProactiveSuggestionStatus[]
    entityType?: ProactiveEntityType | null
    entityId?: string | null
    limit?: number
    sinceSeconds?: number
  }) => {
    const rows = listSuggestions(params.vaultPath, {
      status: params.status,
      entityType: params.entityType,
      entityId: params.entityId,
      limit: params.limit,
      sinceSeconds: params.sinceSeconds
    })
    return rows.map(toIpc)
  })

  ipcMain.handle('proactive:respond', async (_event, params: {
    vaultPath: string
    id: string
    status: 'shown' | 'opened' | 'snoozed' | 'dismissed'
    snoozeUntil?: number | null
  }) => {
    const row = updateStatus(params.vaultPath, {
      id: params.id,
      status: params.status,
      snoozeUntil: params.snoozeUntil
    })
    return row ? toIpc(row) : null
  })

  ipcMain.handle('proactive:get-prefs', async () => {
    return getProactivePrefs() as ProactiveUserPrefs
  })

  ipcMain.handle('proactive:set-prefs', async (_event, params: { prefs: Partial<ProactiveUserPrefs> }) => {
    return setProactivePrefs(params.prefs) as ProactiveUserPrefs
  })

  ipcMain.handle('proactive:debug-run-cycle', async (_event, params: {
    vaultPath: string
    entityType: ProactiveEntityType
    entityId: string
    trigger: ProactiveTriggerKind
    now?: number
    context?: Record<string, unknown>
    userPrefs?: Partial<ProactiveUserPrefs>
  }) => {
    const result = runProactiveCycle({
      vaultPath: params.vaultPath,
      entityType: params.entityType,
      entityId: params.entityId,
      trigger: params.trigger,
      now: params.now,
      context: params.context,
      userPrefs: params.userPrefs
    })
    return {
      evaluated: result.evaluated,
      emitted: result.emitted,
      suggestions: result.suggestions.map(toIpc),
      skippedReasons: result.skippedReasons as Record<string, number>
    }
  })
}
