import { describe, it, expect } from 'vitest'
import { chunkText, cosineSimilarity } from '../packages/main/src/services/embedding'

describe('chunkText', () => {
  it('should split content into chunks', () => {
    const content = 'Line 1\n'.repeat(200)
    const chunks = chunkText(content, 'test-note')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].noteId).toBe('test-note')
    expect(chunks[0].chunkIndex).toBe(0)
  })

  it('should preserve heading context', () => {
    const content = '# Title\n\nSome content here.\n\n## Section\n\n' + 'More text. '.repeat(100)
    const chunks = chunkText(content, 'note-1')
    const lastChunk = chunks[chunks.length - 1]
    expect(lastChunk.headingContext).toBe('Section')
  })

  it('should handle empty content', () => {
    const chunks = chunkText('', 'empty')
    expect(chunks).toHaveLength(0)
  })

  it('should handle short content as single chunk', () => {
    const chunks = chunkText('Hello world', 'short')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Hello world')
  })
})

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vec = new Float32Array([1, 2, 3, 4])
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0)
  })

  it('should return 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0)
  })

  it('should return -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([-1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0)
  })
})
