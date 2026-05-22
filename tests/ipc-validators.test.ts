import { describe, expect, it } from 'vitest'
import {
  ensureBoundedString,
  ensureFiniteNumber,
  ensureNonEmptyString,
  ensureOptionalBoundedString,
  ensureSafeFileName,
  MAX_FILE_NAME_LENGTH,
} from '../packages/main/src/ipc/validators'

describe('ipc validators', () => {
  it('ensureNonEmptyString rejects empty/non-string/too-long', () => {
    expect(() => ensureNonEmptyString('', 'x')).toThrow()
    expect(() => ensureNonEmptyString(undefined, 'x')).toThrow()
    expect(() => ensureNonEmptyString(42 as unknown, 'x')).toThrow()
    expect(() => ensureNonEmptyString('x'.repeat(10), 'x', 5)).toThrow(/exceeds/)
    expect(ensureNonEmptyString('ok', 'x')).toBe('ok')
  })

  it('ensureBoundedString allows empty but caps length', () => {
    expect(ensureBoundedString('', 'x', 10)).toBe('')
    expect(() => ensureBoundedString('abcdef', 'x', 5)).toThrow(/exceeds/)
    expect(() => ensureBoundedString(123 as unknown, 'x', 5)).toThrow()
  })

  it('ensureOptionalBoundedString passes undefined through', () => {
    expect(ensureOptionalBoundedString(undefined, 'x', 5)).toBeUndefined()
    expect(ensureOptionalBoundedString(null, 'x', 5)).toBeUndefined()
    expect(ensureOptionalBoundedString('ab', 'x', 5)).toBe('ab')
    expect(() => ensureOptionalBoundedString('toolong', 'x', 3)).toThrow()
  })

  it('ensureSafeFileName blocks separators and traversal', () => {
    expect(() => ensureSafeFileName('a/b.png', 'x')).toThrow()
    expect(() => ensureSafeFileName('a\\b.png', 'x')).toThrow()
    expect(() => ensureSafeFileName('..', 'x')).toThrow()
    expect(() => ensureSafeFileName('.', 'x')).toThrow()
    expect(() => ensureSafeFileName('with space.png', 'x')).not.toThrow()
    expect(() => ensureSafeFileName('..hidden', 'x')).not.toThrow()
    expect(ensureSafeFileName('image-1234.png', 'x')).toBe('image-1234.png')
  })

  it('ensureSafeFileName caps length', () => {
    expect(() => ensureSafeFileName('x'.repeat(MAX_FILE_NAME_LENGTH + 1), 'x')).toThrow()
  })

  it('ensureFiniteNumber rejects NaN/Infinity/non-number', () => {
    expect(() => ensureFiniteNumber(NaN, 'x')).toThrow()
    expect(() => ensureFiniteNumber(Infinity, 'x')).toThrow()
    expect(() => ensureFiniteNumber('1' as unknown, 'x')).toThrow()
    expect(ensureFiniteNumber(0, 'x')).toBe(0)
    expect(ensureFiniteNumber(-3.14, 'x')).toBe(-3.14)
  })
})
