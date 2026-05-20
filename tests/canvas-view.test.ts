import { describe, expect, it } from 'vitest'
import { findAvailablePosition, getCanvasInitialScrollKey, getViewportCenteredCardOrigin } from '../packages/renderer/src/components/canvas/CanvasView'

describe('canvas card placement', () => {
  it('keys initial scroll by vault only', () => {
    expect(getCanvasInitialScrollKey('/vault/a')).toBe('/vault/a')
    expect(getCanvasInitialScrollKey(null)).toBe('no-vault')
  })

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

  it('places a new card around the current visible viewport center', () => {
    const origin = getViewportCenteredCardOrigin(
      { scrollLeft: 600, scrollTop: 300, clientWidth: 800, clientHeight: 500 },
      { minX: -760, minY: -760 },
      1.25,
      0
    )

    expect(origin).toEqual({ x: -65, y: -376 })
  })

  it('falls back to the default grid when the viewport is unavailable', () => {
    expect(getViewportCenteredCardOrigin(null, { minX: -760, minY: -760 }, 1, 5)).toEqual({ x: 290, y: 210 })
  })
})
