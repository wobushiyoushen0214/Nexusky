import { parentPort, workerData } from 'worker_threads'
import { closeDatabase } from '../services/database'
import { indexVault } from '../services/vault-indexer'

async function main(): Promise<void> {
  const vaultPath = workerData?.vaultPath
  if (typeof vaultPath !== 'string' || !vaultPath) {
    throw new Error('Missing vaultPath for index worker')
  }
  const result = await indexVault(vaultPath, (progress) => {
    parentPort?.postMessage({ type: 'progress', ...progress })
  })
  parentPort?.postMessage({ type: 'done', ...result })
}

main()
  .catch((error) => {
    parentPort?.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
  })
  .finally(() => {
    closeDatabase()
  })
