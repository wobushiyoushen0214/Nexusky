import type { ToolSurfaceEntry } from '@shared/types/ipc'

export interface VaultToolsBoundarySummary {
  total: number
  readOnly: number
  previewWrite: number
  agentOnly: number
}

export function summarizeVaultToolsBoundary(entries: ToolSurfaceEntry[]): VaultToolsBoundarySummary {
  return entries.reduce<VaultToolsBoundarySummary>((summary, entry) => {
    summary.total += 1
    if (entry.kind === 'read_only') summary.readOnly += 1
    else if (entry.kind === 'preview_write') summary.previewWrite += 1
    else summary.agentOnly += 1
    return summary
  }, { total: 0, readOnly: 0, previewWrite: 0, agentOnly: 0 })
}
