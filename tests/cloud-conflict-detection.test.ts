import { describe, expect, it } from 'vitest'
import { decideSyncSide, md5 } from '../packages/main/src/services/cloud/conflict-detection'

describe('decideSyncSide', () => {
  const baseMtime = 1_700_000_000_000

  it('returns noop when hashes match regardless of mtimes', () => {
    expect(
      decideSyncSide({
        localHash: 'abc',
        remoteHash: 'abc',
        localMtimeMs: baseMtime + 99_000,
        remoteMtimeMs: baseMtime
      })
    ).toBe('noop')
  })

  it('returns conflict when hashes differ but mtimes are within tolerance', () => {
    expect(
      decideSyncSide({
        localHash: 'a',
        remoteHash: 'b',
        localMtimeMs: baseMtime + 1_000,
        remoteMtimeMs: baseMtime
      })
    ).toBe('conflict')

    expect(
      decideSyncSide({
        localHash: 'a',
        remoteHash: 'b',
        localMtimeMs: baseMtime - 4_999,
        remoteMtimeMs: baseMtime
      })
    ).toBe('conflict')
  })

  it('returns push when local mtime exceeds remote by more than tolerance', () => {
    expect(
      decideSyncSide({
        localHash: 'a',
        remoteHash: 'b',
        localMtimeMs: baseMtime + 6_000,
        remoteMtimeMs: baseMtime
      })
    ).toBe('push')
  })

  it('returns pull when remote mtime exceeds local by more than tolerance', () => {
    expect(
      decideSyncSide({
        localHash: 'a',
        remoteHash: 'b',
        localMtimeMs: baseMtime,
        remoteMtimeMs: baseMtime + 6_000
      })
    ).toBe('pull')
  })

  it('respects custom tolerance', () => {
    expect(
      decideSyncSide({
        localHash: 'a',
        remoteHash: 'b',
        localMtimeMs: baseMtime + 10_000,
        remoteMtimeMs: baseMtime,
        mtimeToleranceMs: 15_000
      })
    ).toBe('conflict')
  })
})

describe('md5', () => {
  it('returns a stable hex digest for string and buffer inputs', () => {
    const text = 'hello'
    expect(md5(text)).toBe(md5(Buffer.from(text)))
    expect(md5(text)).toMatch(/^[0-9a-f]{32}$/)
  })
})
