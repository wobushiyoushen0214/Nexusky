import { describe, expect, it } from 'vitest'
import { isVersionNewer } from '../packages/main/src/services/version'

describe('isVersionNewer', () => {
  it('does not report the current release as a new version', () => {
    expect(isVersionNewer('0.2.4', '0.2.4')).toBe(false)
    expect(isVersionNewer('v0.2.4', '0.2.4')).toBe(false)
    expect(isVersionNewer('0.2.4+build.2', '0.2.4')).toBe(false)
  })

  it('only reports strictly newer versions', () => {
    expect(isVersionNewer('0.2.5', '0.2.4')).toBe(true)
    expect(isVersionNewer('0.3.0', '0.2.9')).toBe(true)
    expect(isVersionNewer('0.2.3', '0.2.4')).toBe(false)
  })

  it('handles prerelease precedence', () => {
    expect(isVersionNewer('1.0.0', '1.0.0-beta.1')).toBe(true)
    expect(isVersionNewer('1.0.0-beta.2', '1.0.0-beta.1')).toBe(true)
    expect(isVersionNewer('1.0.0-beta.1', '1.0.0')).toBe(false)
  })
})
