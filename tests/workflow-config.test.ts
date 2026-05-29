import { readFileSync } from 'fs'
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
