import { describe, expect, it } from 'vitest'
import { getErrorMessage } from '../packages/shared/src/utils/errors'

describe('getErrorMessage', () => {
  it('returns Error.message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns the string itself for raw string errors', () => {
    expect(getErrorMessage('plain failure')).toBe('plain failure')
  })

  it('extracts message from object-shaped errors', () => {
    expect(getErrorMessage({ message: 'wrapped' })).toBe('wrapped')
  })

  it('falls back to fallback when error is null/undefined', () => {
    expect(getErrorMessage(null, 'fallback')).toBe('fallback')
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback')
  })

  it('falls back to error.name when Error has empty message', () => {
    const err = new Error('')
    expect(getErrorMessage(err, 'fb')).toBe('fb')
    const named = new TypeError('')
    expect(getErrorMessage(named)).toBe('TypeError')
  })

  it('stringifies primitive errors', () => {
    expect(getErrorMessage(42)).toBe('42')
    expect(getErrorMessage(true)).toBe('true')
  })

  it('returns fallback when error has empty fallback and is null', () => {
    expect(getErrorMessage(null)).toBe('')
  })
})
