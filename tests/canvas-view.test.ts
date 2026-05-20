import { describe, expect, it } from 'vitest'
import { buildArchivePositions, findAvailablePosition, getCanvasInitialScrollKey, getViewportCenteredCardOrigin, routeBetweenCards } from '../packages/renderer/src/components/canvas/CanvasView'
import type { PropertyTableRow } from '../packages/shared/src/types/ipc'

function row(id: string, properties: PropertyTableRow['properties']): PropertyTableRow {
  return {
    id,
    title: id,
    filePath: `${id}.md`,
    createdAt: 1,
    updatedAt: 1,
    properties
  }
}

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

  it('archives initial card positions by metadata groups', () => {
    const positions = buildArchivePositions([
      row('readwise-a', { source: 'readwise' }),
      row('readwise-b', { source: 'readwise' }),
      row('project', { tags: ['project'] })
    ])

    expect(Math.abs(positions['readwise-a'].x - positions['readwise-b'].x)).toBeLessThan(260)
    expect(Math.abs(positions.project.x - positions['readwise-a'].x)).toBeGreaterThanOrEqual(300)
  })

  it('routes links around blocking cards with elbow paths', () => {
    const route = routeBetweenCards(
      { x: 0, y: 0 },
      { x: 520, y: 0 },
      [{ left: 240, right: 450, top: -14, bottom: 126 }]
    )

    expect(route.length).toBeGreaterThan(2)
    expect(route.some((point) => point.y !== 56)).toBe(true)
  })
})
