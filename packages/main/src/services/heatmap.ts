import { getDatabase } from './database'

export interface HeatmapEntry {
  date: string
  count: number
}

export function rebuildHeatmap(vaultPath: string): void {
  const db = getDatabase(vaultPath)

  // Clear old data
  db.exec('DELETE FROM heatmap_daily')

  // Aggregate context_events by date
  db.exec(`
    INSERT INTO heatmap_daily (date, event_type, count)
    SELECT
      date(created_at / 1000, 'unixepoch') as d,
      event_type,
      COUNT(*) as cnt
    FROM context_events
    WHERE created_at > 0
    GROUP BY d, event_type
  `)
}

export function getHeatmap(
  vaultPath: string,
  startDate?: string,
  endDate?: string
): HeatmapEntry[] {
  const db = getDatabase(vaultPath)

  const start = startDate || '0001-01-01'
  const end = endDate || '9999-12-31'

  // Ensure data exists; rebuild if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM heatmap_daily').get() as { c: number }
  if (count.c === 0) {
    rebuildHeatmap(vaultPath)
  }

  const rows = db.prepare(`
    SELECT date, SUM(count) as total
    FROM heatmap_daily
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(start, end) as Array<{ date: string; total: number }>

  return rows.map((r) => ({ date: r.date, count: r.total }))
}

/** Call this after recording a context event to update heatmap incrementally */
export function recordHeatmapEvent(vaultPath: string, eventType: string, timestamp: number): void {
  const db = getDatabase(vaultPath)
  const date = new Date(timestamp).toISOString().slice(0, 10)

  db.prepare(`
    INSERT INTO heatmap_daily (date, event_type, count)
    VALUES (?, ?, 1)
    ON CONFLICT(date, event_type) DO UPDATE SET
      count = count + 1
  `).run(date, eventType)
}
