import { existsSync, readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

describe('workflow configuration', () => {
  it('runs build smoke in CI without adding lint to the no-eslint pipeline', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf-8')

    expect(ci).toContain('pnpm run typecheck')
    expect(ci).toContain('pnpm run build')
    expect(ci).toContain('pnpm test')
    expect(ci).not.toContain('pnpm run lint')
  })

  it('uses frozen dependency installs for release builds', () => {
    const build = readFileSync('.github/workflows/build.yml', 'utf-8')
    const installs = Array.from(build.matchAll(/pnpm install[^\n]*/g)).map((match) => match[0])

    expect(installs.length).toBeGreaterThan(0)
    expect(installs.every((line) => line.includes('--frozen-lockfile'))).toBe(true)
  })

  it('allows mac release artifacts without Developer ID secrets', () => {
    const build = readFileSync('.github/workflows/build.yml', 'utf-8')
    const builder = readFileSync('electron-builder.yml', 'utf-8')

    expect(builder).toContain('identity: null')
    expect(builder).toContain('notarize: false')
    expect(builder).toContain('target: zip')
    expect(builder).toContain('afterPack: ./scripts/afterPack.js')
    expect(existsSync('scripts/afterPack.js')).toBe(true)

    expect(build).toContain('pnpm exec electron-builder --mac --x64 --publish always')
    expect(build).toContain('pnpm exec electron-builder --mac --arm64 --publish always')
    expect(build).not.toContain('MAC_CSC_LINK')
    expect(build).not.toContain('MAC_CSC_KEY_PASSWORD')
    expect(build).not.toContain('APPLE_API_KEY')
    expect(build).not.toContain('APPLE_API_KEY_ID')
    expect(build).not.toContain('APPLE_API_ISSUER')
    expect(build).toContain('dist/latest-mac.yml')
  })

  it('allows unsigned Windows release artifacts', () => {
    const build = readFileSync('.github/workflows/build.yml', 'utf-8')
    const builder = readFileSync('electron-builder.yml', 'utf-8')

    expect(builder).toContain('sign: false')
    expect(builder).toContain('verifyUpdateCodeSignature: false')
    expect(build).toContain('pnpm exec electron-builder --win nsis --x64 --publish always')
    expect(build).not.toContain('WIN_CSC_LINK')
    expect(build).not.toContain('WIN_CSC_KEY_PASSWORD')
  })

  it('declares the runtime package manager and engine range', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      packageManager?: string
      engines?: { node?: string; pnpm?: string }
    }

    expect(pkg.packageManager).toMatch(/^pnpm@10\./)
    expect(pkg.engines?.node).toBe('>=22 <23')
    expect(pkg.engines?.pnpm).toBe('>=10 <11')
  })
})
