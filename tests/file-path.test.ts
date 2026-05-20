import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { isPathInsideVault } from '../packages/main/src/ipc/file-path'

describe('file path safety', () => {
  const vault = join('/tmp', 'vault')

  it('allows files inside the vault', () => {
    expect(isPathInsideVault(join(vault, 'Notes', 'A.md'), vault)).toBe(true)
  })

  it('allows the vault path itself', () => {
    expect(isPathInsideVault(vault, vault)).toBe(true)
  })

  it('rejects sibling paths that merely share the same prefix', () => {
    expect(isPathInsideVault(join('/tmp', 'vault-copy', 'A.md'), vault)).toBe(false)
  })

  it('rejects traversal outside the vault', () => {
    expect(isPathInsideVault(join(vault, '..', 'outside.md'), vault)).toBe(false)
  })
})
