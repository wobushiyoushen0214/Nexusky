import { describe, expect, it } from 'vitest'
import { planSync, manifestFromLocal, type SyncManifest } from '../packages/main/src/services/cloud/sync-reconcile'
import type { LocalFileInfo } from '../packages/main/src/services/cloud/sync-reconcile'
import type { SyncFileInfo } from '../packages/main/src/services/cloud/provider'

const T0 = '2026-05-01T00:00:00.000Z'
const T0_MS = new Date(T0).getTime()

function local(relPath: string, hash: string, mtimeMs = T0_MS): LocalFileInfo {
  return { relPath, hash, mtimeMs }
}
function remote(path: string, hash: string, updatedAt = T0): SyncFileInfo {
  return { path, hash, updatedAt }
}

describe('planSync', () => {
  it('with an empty manifest behaves as two-way: local-only pushes, remote-only pulls, nothing deleted', () => {
    const plan = planSync({
      localFiles: [local('a.md', 'h1')],
      remoteFiles: [remote('b.md', 'h2')],
      manifest: {}
    })
    expect(plan.push).toEqual(['a.md'])
    expect(plan.pull).toEqual(['b.md'])
    expect(plan.deleteRemote).toEqual([])
    expect(plan.deleteLocal).toEqual([])
  })

  it('propagates a local deletion to the remote when the file is in the baseline', () => {
    const manifest: SyncManifest = { 'gone.md': { hash: 'h1' } }
    const plan = planSync({
      localFiles: [],
      remoteFiles: [remote('gone.md', 'h1')],
      manifest
    })
    expect(plan.deleteRemote).toEqual(['gone.md'])
    expect(plan.pull).toEqual([]) // must NOT resurrect it
  })

  it('does NOT delete a remote-only file that is not in the baseline (genuine remote addition)', () => {
    const plan = planSync({
      localFiles: [],
      remoteFiles: [remote('new-from-other-device.md', 'h1')],
      manifest: {}
    })
    expect(plan.pull).toEqual(['new-from-other-device.md'])
    expect(plan.deleteRemote).toEqual([])
  })

  it('propagates a remote deletion to the local copy when the file is in the baseline', () => {
    const manifest: SyncManifest = { 'gone.md': { hash: 'h1' } }
    const plan = planSync({
      localFiles: [local('gone.md', 'h1')],
      remoteFiles: [],
      manifest
    })
    expect(plan.deleteLocal).toEqual(['gone.md'])
    expect(plan.push).toEqual([]) // must NOT re-upload it
  })

  it('does NOT delete a local-only file that is not in the baseline (genuine local addition)', () => {
    const plan = planSync({
      localFiles: [local('brand-new.md', 'h1')],
      remoteFiles: [],
      manifest: {}
    })
    expect(plan.push).toEqual(['brand-new.md'])
    expect(plan.deleteLocal).toEqual([])
  })

  it('noops when both sides have identical content', () => {
    const plan = planSync({
      localFiles: [local('same.md', 'h-same')],
      remoteFiles: [remote('same.md', 'h-same')],
      manifest: { 'same.md': { hash: 'h-same' } }
    })
    expect(plan).toMatchObject({ push: [], pull: [], deleteRemote: [], deleteLocal: [], conflicts: [] })
  })

  it('pushes when local is clearly newer, pulls when remote is clearly newer', () => {
    const newer = new Date(T0_MS + 60_000)
    const older = new Date(T0_MS - 60_000)
    const pushPlan = planSync({
      localFiles: [local('x.md', 'hl', newer.getTime())],
      remoteFiles: [remote('x.md', 'hr', T0)],
      manifest: {}
    })
    expect(pushPlan.push).toEqual(['x.md'])
    const pullPlan = planSync({
      localFiles: [local('y.md', 'hl', older.getTime())],
      remoteFiles: [remote('y.md', 'hr', T0)],
      manifest: {}
    })
    expect(pullPlan.pull).toEqual(['y.md'])
  })

  it('reports a conflict when both changed within the mtime tolerance', () => {
    const plan = planSync({
      localFiles: [local('c.md', 'hl', T0_MS + 1000)],
      remoteFiles: [remote('c.md', 'hr', T0)],
      manifest: {},
      mtimeToleranceMs: 5000
    })
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0].path).toBe('c.md')
    expect(plan.push).toEqual([])
    expect(plan.pull).toEqual([])
  })

  it('manifestFromLocal snapshots relPath -> hash', () => {
    expect(manifestFromLocal([local('a.md', 'h1'), local('b.md', 'h2')])).toEqual({
      'a.md': { hash: 'h1' },
      'b.md': { hash: 'h2' }
    })
  })
})
