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

  it('requires mac release signing, notarization, and checksums', () => {
    const build = readFileSync('.github/workflows/build.yml', 'utf-8')
    const builder = readFileSync('electron-builder.yml', 'utf-8')

    expect(builder).not.toContain('identity: null')
    expect(builder).toContain('hardenedRuntime: true')
    expect(builder).toContain('notarize: true')
    expect(builder).toContain('target: zip')
    expect(builder).toContain('afterPack: ./scripts/afterPack.js')
    expect(existsSync('scripts/afterPack.js')).toBe(true)

    expect(build).toContain('pnpm exec electron-builder --mac --x64 --publish always')
    expect(build).toContain('pnpm exec electron-builder --mac --arm64 --publish always')
    expect(build).toContain('MAC_CSC_LINK is required')
    expect(build).toContain('MAC_CSC_KEY_PASSWORD is required')
    expect(build).toContain('APPLE_API_KEY is required')
    expect(build).toContain('APPLE_API_KEY_ID is required')
    expect(build).toContain('APPLE_API_ISSUER is required')
    expect(build).toContain('CSC_LINK: ${{ secrets.MAC_CSC_LINK }}')
    expect(build).toContain('APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}')
    expect(build).toContain('SHA256SUMS-mac-x64.txt')
    expect(build).toContain('SHA256SUMS-mac-arm64.txt')
    expect(build).toContain('dist/latest-mac.yml')
  })

  it('requires signed Windows release artifacts and update signature verification', () => {
    const build = readFileSync('.github/workflows/build.yml', 'utf-8')
    const builder = readFileSync('electron-builder.yml', 'utf-8')

    expect(builder).not.toContain('sign: false')
    expect(builder).toContain('verifyUpdateCodeSignature: true')
    expect(builder).toContain('signAndEditExecutable: true')
    expect(build).toContain('pnpm exec electron-builder --win nsis --x64 --publish always')
    expect(build).toContain('Windows release builds require WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD secrets.')
    expect(build).toContain('CSC_LINK: ${{ secrets.WIN_CSC_LINK }}')
    expect(build).toContain('CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}')
    expect(build).toContain('SHA256SUMS-windows.txt')
  })

  it('publishes checksum artifacts for every release platform', () => {
    const build = readFileSync('.github/workflows/build.yml', 'utf-8')

    expect(build).toContain('gh release upload "$env:GITHUB_REF_NAME" dist/SHA256SUMS-windows.txt --clobber')
    expect(build).toContain('gh release upload "$GITHUB_REF_NAME" dist/SHA256SUMS-mac-x64.txt --clobber')
    expect(build).toContain('gh release upload "$GITHUB_REF_NAME" dist/SHA256SUMS-mac-arm64.txt --clobber')
    expect(build).toContain('gh release upload "$GITHUB_REF_NAME" dist/SHA256SUMS-linux.txt --clobber')
  })

  it('documents release artifact verification for maintainers and users', () => {
    const checklist = readFileSync('docs/RELEASE_TRUST_CHECKLIST.md', 'utf-8')
    const migrationGuide = readFileSync('docs/MIGRATION_GUIDE.md', 'utf-8')

    expect(checklist).toContain('WIN_CSC_LINK')
    expect(checklist).toContain('MAC_CSC_LINK')
    expect(checklist).toContain('APPLE_API_KEY')
    expect(checklist).toContain('SHA256SUMS')
    expect(migrationGuide).toContain('安装包来源验证')
    expect(migrationGuide).toContain('docs/RELEASE_TRUST_CHECKLIST.md')
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
