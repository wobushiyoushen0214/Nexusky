import { decideSyncSide } from './conflict-detection'
import type { SyncConflict, SyncFileInfo } from './provider'

export interface LocalFileInfo {
  relPath: string
  hash: string
  mtimeMs: number
}

/** Snapshot of the last successful sync: relPath -> content hash. */
export interface SyncManifest {
  [relPath: string]: { hash: string }
}

export interface SyncPlan {
  push: string[]
  pull: string[]
  deleteRemote: string[]
  deleteLocal: string[]
  conflicts: SyncConflict[]
}

/**
 * Three-way sync decision (local now, remote now, manifest baseline).
 *
 * The manifest is what distinguishes a deletion from an addition:
 * - file present on one side only AND in the manifest  -> it was deleted on the
 *   other side, so propagate the deletion.
 * - file present on one side only AND NOT in the manifest -> it is new, so copy
 *   it to the other side.
 *
 * Crucially, with an EMPTY manifest every one-sided file falls into the "new"
 * branch, so planSync degrades to the exact previous two-way behaviour
 * (local-only -> push, remote-only -> pull) and never deletes anything. Deletion
 * propagation therefore only activates once a baseline has been recorded, which
 * makes adopting it safe: the first sync can't delete data.
 */
export function planSync(args: {
  localFiles: LocalFileInfo[]
  remoteFiles: SyncFileInfo[]
  manifest: SyncManifest
  mtimeToleranceMs?: number
}): SyncPlan {
  const { localFiles, remoteFiles, manifest, mtimeToleranceMs } = args
  const localMap = new Map(localFiles.map((f) => [f.relPath, f]))
  const remoteMap = new Map(remoteFiles.map((f) => [f.path, f]))
  const plan: SyncPlan = { push: [], pull: [], deleteRemote: [], deleteLocal: [], conflicts: [] }

  const allPaths = new Set<string>([...localMap.keys(), ...remoteMap.keys()])

  for (const path of allPaths) {
    const local = localMap.get(path)
    const remote = remoteMap.get(path)
    const inManifest = Object.prototype.hasOwnProperty.call(manifest, path)

    if (local && remote) {
      const side = decideSyncSide({
        localHash: local.hash,
        remoteHash: remote.hash,
        localMtimeMs: local.mtimeMs,
        remoteMtimeMs: new Date(remote.updatedAt).getTime(),
        mtimeToleranceMs
      })
      if (side === 'push') plan.push.push(path)
      else if (side === 'pull') plan.pull.push(path)
      else if (side === 'conflict') {
        plan.conflicts.push({
          path,
          localHash: local.hash,
          remoteHash: remote.hash,
          remoteUpdatedAt: remote.updatedAt
        })
      }
      // 'noop' -> nothing to do
    } else if (local && !remote) {
      if (inManifest) plan.deleteLocal.push(path)
      else plan.push.push(path)
    } else if (!local && remote) {
      if (inManifest) plan.deleteRemote.push(path)
      else plan.pull.push(path)
    }
  }

  return plan
}

/** Build the next manifest from the post-sync local file set. */
export function manifestFromLocal(localFiles: LocalFileInfo[]): SyncManifest {
  const manifest: SyncManifest = {}
  for (const f of localFiles) manifest[f.relPath] = { hash: f.hash }
  return manifest
}
