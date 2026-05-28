import { createHash } from 'crypto'

export type SyncSide = 'push' | 'pull' | 'conflict' | 'noop'

export interface ConflictInputs {
  localHash: string
  remoteHash: string
  localMtimeMs: number
  remoteMtimeMs: number
  /** Tolerance (ms) for treating two mtimes as effectively simultaneous. Default 5000. */
  mtimeToleranceMs?: number
}

/**
 * Decide which side to act on when both local and remote have the file.
 *
 * Hash equality always wins: if both bytes match, there is nothing to do.
 *
 * If hashes differ:
 * - When mtimes are within tolerance we cannot tell which side is newer, so we
 *   return `conflict` and let the user resolve.
 * - Otherwise the newer mtime wins (push if local is newer, pull if remote is
 *   newer).
 */
export function decideSyncSide(input: ConflictInputs): SyncSide {
  if (input.localHash === input.remoteHash) return 'noop'

  const tolerance = input.mtimeToleranceMs ?? 5000
  const diff = input.localMtimeMs - input.remoteMtimeMs

  if (Math.abs(diff) <= tolerance) return 'conflict'
  return diff > 0 ? 'push' : 'pull'
}

export function md5(content: Buffer | string): string {
  return createHash('md5').update(content).digest('hex')
}
