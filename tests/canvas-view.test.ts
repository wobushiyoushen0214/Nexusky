import { describe, expect, it } from 'vitest'
import { findAvailablePosition } from '../packages/renderer/src/components/canvas/CanvasView'

describe('canvas card placement', () => {
  it('keeps a new card at the requested origin when the space is free', () => {
    expect(findAvailablePosition({ x: 100, y: 120 }, [])).toEqual({ x: 100, y: 120 })
  })

  it('moves a new card to a nearby free slot when the viewport center is occupied', () => {
    const origin = { x: 100, y: 120 }
    const position = findAvailablePosition(origin, [origin])

    expect(position).not.toEqual(origin)
    expect(position.x).toBeGreaterThan(origin.x)
    expect(position.y).toBe(origin.y)
  })

  it('skips occupied nearby slots instead of stacking cards', () => {
    const origin = { x: 100, y: 120 }
    const first = findAvailablePosition(origin, [origin])
    const second = findAvailablePosition(origin, [origin, first])

    expect(second).not.toEqual(origin)
    expect(second).not.toEqual(first)
  })
})
