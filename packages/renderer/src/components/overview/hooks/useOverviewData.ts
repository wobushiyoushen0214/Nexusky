import { useCallback, useEffect, useState } from 'react'
import type {
  AIUsageRecord,
  PropertyTableRow,
  VaultHealthSummary
} from '@shared/types/ipc'

export interface OverviewData {
  health: VaultHealthSummary | null
  notes: PropertyTableRow[]
  usageRecords: AIUsageRecord[]
}

const TOKEN_WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export function useOverviewData(vaultPath: string | null) {
  const [data, setData] = useState<OverviewData>({
    health: null,
    notes: [],
    usageRecords: []
  })
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const since = Date.now() - (TOKEN_WINDOW_DAYS - 1) * DAY_MS
      const [
        health,
        notes,
        usageRecords
      ] = await Promise.all([
        window.api.invoke('vault:health-scan', { vaultPath }).catch(() => null),
        window.api.invoke('db:get-property-rows', { vaultPath }).catch(() => [] as PropertyTableRow[]),
        window.api.invoke('ai:list-usage-records', { since, limit: 1000 }).catch(() => [] as AIUsageRecord[])
      ])
      setData({
        health,
        notes,
        usageRecords
      })
    } finally {
      setLoading(false)
    }
  }, [vaultPath])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, reload: load }
}
