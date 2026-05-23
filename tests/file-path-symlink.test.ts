import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { assertPathInsideVault } from '../packages/main/src/ipc/file-path'

let vault = ''
let outside = ''

// On Windows, creating symlinks requires Developer Mode or Administrator
// privileges. Probe once and conditionally skip those cases so the suite stays
// portable.
function canCreateSymlinks(): boolean {
  const probeRoot = mkdtempSync(join(tmpdir(), 'nexusky-symlink-probe-'))
  try {
    const target = join(probeRoot, 'target')
    writeFileSync(target, 'probe')
    symlinkSync(target, join(probeRoot, 'link'))
    return true
  } catch {
    return false
  } finally {
    try { rmSync(probeRoot, { recursive: true, force: true }) } catch {}
  }
}

const symlinkSupported = canCreateSymlinks()
const symlinkIt = symlinkSupported ? it : it.skip

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'nexusky-symlink-'))
  vault = join(root, 'vault')
  outside = join(root, 'outside')
  mkdirSync(vault, { recursive: true })
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, 'secret.md'), 'hidden')
})

afterEach(() => {
  try { rmSync(vault, { recursive: true, force: true }) } catch {}
  try { rmSync(outside, { recursive: true, force: true }) } catch {}
})

describe('assertPathInsideVault', () => {
  it('accepts an ordinary file inside the vault', async () => {
    const p = join(vault, 'note.md')
    writeFileSync(p, 'hi')
    await expect(assertPathInsideVault(p, vault)).resolves.toBeTruthy()
  })

  it('rejects naive traversal outside the vault', async () => {
    await expect(assertPathInsideVault(join(vault, '..', 'outside', 'secret.md'), vault)).rejects.toThrow()
  })

  symlinkIt('rejects a symlink that points outside the vault', async () => {
    const link = join(vault, 'escape.md')
    symlinkSync(join(outside, 'secret.md'), link)
    await expect(assertPathInsideVault(link, vault)).rejects.toThrow(/符号链接|笔记空间/)
  })

  symlinkIt('rejects writes through a symlinked directory', async () => {
    const dirLink = join(vault, 'shadow')
    symlinkSync(outside, dirLink)
    const target = join(dirLink, 'new.md')
    await expect(assertPathInsideVault(target, vault)).rejects.toThrow()
  })

  it('allows new files in not-yet-existing folders inside vault', async () => {
    const target = join(vault, 'subdir', 'fresh.md')
    await expect(assertPathInsideVault(target, vault)).resolves.toMatch(/subdir[\\/]+fresh\.md$/)
  })
})
