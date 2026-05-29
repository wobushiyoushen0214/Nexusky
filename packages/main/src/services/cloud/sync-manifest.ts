import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { SyncProviderType } from './provider'
import type { SyncManifest } from './sync-reconcile'

function manifestPath(vaultPath: string, type: SyncProviderType): string {
  return join(vaultPath, '.nexusky', `sync-manifest-${type}.json`)
}

/**
 * Read the last-successful-sync baseline for a provider. Missing/corrupt files
 * return {} so sync degrades to two-way (no deletion propagation), never throws.
 */
export function readManifest(vaultPath: string, type: SyncProviderType): SyncManifest {
  try {
    const p = manifestPath(vaultPath, type)
    if (!existsSync(p)) return {}
    const parsed = JSON.parse(readFileSync(p, 'utf-8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SyncManifest
    }
    return {}
  } catch {
    return {}
  }
}

export function writeManifest(vaultPath: string, type: SyncProviderType, manifest: SyncManifest): void {
  try {
    const p = manifestPath(vaultPath, type)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(manifest), 'utf-8')
  } catch {
    // The manifest is only an optimization for deletion detection; if it can't
    // be written, the next sync simply falls back to two-way (no data loss).
  }
}
