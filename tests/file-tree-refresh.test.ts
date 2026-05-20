import { describe, expect, it } from 'vitest'
import { getFileTreeReloadPaths } from '../packages/renderer/src/components/sidebar/VirtualFileTree'

describe('file tree refresh helpers', () => {
  it('reloads the expanded parent directory for a changed file', () => {
    expect(getFileTreeReloadPaths(
      ['/vault/Projects/AI Note.md'],
      new Set(['/vault/Projects']),
      new Set()
    )).toEqual(['/vault/Projects'])
  })

  it('reloads changed import directories directly when they are expanded', () => {
    expect(getFileTreeReloadPaths(
      ['/vault/Imports/Readwise'],
      new Set(['/vault/Imports/Readwise']),
      new Set(['/vault/Imports/Readwise'])
    )).toEqual(['/vault/Imports/Readwise'])
  })

  it('matches Windows-style paths against existing tree keys without changing their shape', () => {
    expect(getFileTreeReloadPaths(
      ['C:\\vault\\Projects\\AI Note.md'],
      new Set(['C:\\vault\\Projects']),
      new Set()
    )).toEqual(['C:\\vault\\Projects'])
  })
})
