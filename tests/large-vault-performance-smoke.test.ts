import { performance } from 'node:perf_hooks'
import { afterAll, describe, expect, it } from 'vitest'

const vaultPath = process.env.NEXUSKY_PERF_VAULT
const describePerf = vaultPath ? describe : describe.skip
const includeHeavyStages = process.env.NEXUSKY_PERF_INCLUDE_HEAVY === '1'

describePerf('10k vault performance smoke', () => {
  afterAll(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
  })

  it('records service-level timings for the manual large-vault runbook', async () => {
    const { indexVault } = await import('../packages/main/src/services/vault-indexer')
    const { scanVaultHealth } = await import('../packages/main/src/services/vault-health')
    const { lexicalSearch } = await import('../packages/main/src/services/search-index')

    const timings: Record<string, number> = {}
    const measure = async <T>(name: string, run: () => T | Promise<T>): Promise<T> => {
      const startedAt = performance.now()
      const result = await run()
      timings[name] = Math.round(performance.now() - startedAt)
      console.info(`10k vault performance smoke: ${name} ${timings[name]}ms`)
      return result
    }

    const indexResult = await measure('indexVault', () => indexVault(vaultPath!))
    const health = await measure('scanVaultHealth', () => scanVaultHealth(vaultPath!))
    const searchResults = await measure('lexicalSearch', () => lexicalSearch(vaultPath!, 'retrieval strategy', 10, { rerank: false }))
    if (includeHeavyStages) {
      const { getGraphData } = await import('../packages/main/src/services/indexer')
      const { gatherMaintenanceItems } = await import('../packages/main/src/services/maintenance/queue-builder')
      const graph = await measure('getGraphData', () => getGraphData(vaultPath!, 'folder'))
      const maintenance = await measure('gatherMaintenanceItems.links', () => gatherMaintenanceItems({
        vaultPath: vaultPath!,
        scanGroups: ['links'],
        limit: 200,
        language: 'en'
      }))
      expect(graph.nodes.length).toBeGreaterThan(0)
      expect(maintenance.items.length).toBeGreaterThan(0)
    }

    console.info('10k vault performance smoke timings', timings)
    expect(indexResult.indexed).toBeGreaterThanOrEqual(10_000)
    expect(health.noteCount).toBeGreaterThanOrEqual(10_000)
    expect(searchResults.length).toBeGreaterThan(0)
  }, includeHeavyStages ? 900_000 : 600_000)
})
