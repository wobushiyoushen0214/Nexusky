import { describe, expect, it } from 'vitest'
import { redact } from '../packages/main/src/services/redact'

describe('redact', () => {
  it('removes sensitive keys at any nesting level', () => {
    const input = {
      apiKey: 'sk-very-secret',
      nested: {
        accessToken: 'abc',
        details: {
          password: 'p@ssw0rd',
          ok: 'visible',
        },
      },
      arr: [{ token: 't', label: 'shown' }],
    }
    const out = redact(input) as typeof input
    expect(out.apiKey).toBe('[REDACTED]')
    expect(out.nested.accessToken).toBe('[REDACTED]')
    expect(out.nested.details.password).toBe('[REDACTED]')
    expect(out.nested.details.ok).toBe('visible')
    expect(out.arr[0].token).toBe('[REDACTED]')
    expect(out.arr[0].label).toBe('shown')
  })

  it('matches case-insensitively and via underscores/dashes', () => {
    const input = {
      API_KEY: 'k',
      'service-role-key': 'k',
      ClientSecret: 'k',
      somethingElse: 'visible',
    }
    const out = redact(input) as typeof input
    expect(out.API_KEY).toBe('[REDACTED]')
    expect(out['service-role-key']).toBe('[REDACTED]')
    expect(out.ClientSecret).toBe('[REDACTED]')
    expect(out.somethingElse).toBe('visible')
  })

  it('masks loose sk- / Bearer / Basic tokens inside free-form strings', () => {
    const out = redact('OpenAI rejected sk-abc123def456 with status 401') as string
    expect(out).toContain('[REDACTED]')
    expect(out).not.toContain('sk-abc123def456')
    expect(redact('Authorization: Bearer ey.JWT.token')).toContain('[REDACTED]')
    expect(redact('Authorization: Basic dXNlcjpwYXNzd29yZA==')).toContain('[REDACTED]')
  })

  it('truncates extremely long strings', () => {
    const huge = 'x'.repeat(5000)
    const out = redact(huge) as string
    expect(out.length).toBeLessThan(huge.length)
    expect(out).toMatch(/truncated/)
  })

  it('redacts Error objects without losing structure', () => {
    const err = new Error('OpenAI key sk-abcdefghij failed')
    ;(err as unknown as Record<string, unknown>).apiKey = 'sk-explicit'
    const out = redact(err) as Record<string, unknown>
    expect(out.name).toBe('Error')
    expect(out.message).toContain('[REDACTED]')
    expect(out.apiKey).toBe('[REDACTED]')
  })

  it('handles circular references without infinite loops', () => {
    const a: Record<string, unknown> = { name: 'a' }
    const b: Record<string, unknown> = { name: 'b', parent: a }
    a.child = b
    expect(() => redact(a)).not.toThrow()
  })

  it('returns primitives unchanged', () => {
    expect(redact(42)).toBe(42)
    expect(redact(true)).toBe(true)
    expect(redact(null)).toBeNull()
    expect(redact(undefined)).toBeUndefined()
  })
})
