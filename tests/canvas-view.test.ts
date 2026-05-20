import { describe, expect, it } from 'vitest'
import { appendCanvasAssociationLink, applyCanvasModeOverrides, buildArchivePositions, buildCanvasAssociationSuggestions, findAvailablePosition, getCanvasAssociationWikilink, getCanvasInitialScrollKey, getNextCanvasAssociationKey, getViewportCenteredCardOrigin, routeBetweenCards } from '../packages/renderer/src/components/canvas/CanvasView'
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

  it('suggests implicit associations without duplicating existing graph links', () => {
    const rows = [
      row('react-hooks', { tags: ['react'], source: 'readwise' }),
      row('react-props', { tags: ['react'], source: 'pocket' }),
      row('pocket-react', { tags: ['css'], source: 'pocket' }),
      row('loose', { tags: ['writing'] })
    ]

    expect(buildCanvasAssociationSuggestions(rows, [{ source: 'react-hooks', target: 'react-props' }]).map((edge) => [edge.source, edge.target])).toEqual([
      ['react-props', 'pocket-react']
    ])
    expect(buildCanvasAssociationSuggestions(rows, []).map((edge) => [edge.source, edge.target])).toContainEqual(['react-hooks', 'react-props'])
  })

  it('writes accepted association links into a connections section', () => {
    const target = row('Target Note', { tags: ['react'] })
    target.title = 'Target Note'
    target.filePath = 'Topics/Target Note.md'

    expect(getCanvasAssociationWikilink(target)).toBe('[[Topics/Target Note|Target Note]]')
    expect(appendCanvasAssociationLink('# Source\n\nBody', target)).toBe('# Source\n\nBody\n\n## Connections\n\n- [[Topics/Target Note|Target Note]]\n')
    expect(appendCanvasAssociationLink('# Source\n\n## Connections\n\n- [[Existing]]\n\n## Later\n\nText', target)).toContain('- [[Existing]]\n- [[Topics/Target Note|Target Note]]\n\n## Later')
    expect(appendCanvasAssociationLink('# Source\n\nAlready [[Topics/Target Note|Target Note]]', target)).toBe('# Source\n\nAlready [[Topics/Target Note|Target Note]]')
  })

  it('cycles through association review keys', () => {
    const keys = ['a', 'b', 'c']

    expect(getNextCanvasAssociationKey(keys, null, 1)).toBe('a')
    expect(getNextCanvasAssociationKey(keys, null, -1)).toBe('c')
    expect(getNextCanvasAssociationKey(keys, 'a', 1)).toBe('b')
    expect(getNextCanvasAssociationKey(keys, 'a', -1)).toBe('c')
    expect(getNextCanvasAssociationKey([], 'a', 1)).toBeNull()
  })

  it('applies per-mode manual position overrides without mutating the base layout', () => {
    const base = {
      a: { x: 40, y: 72 },
      b: { x: 310, y: 72 }
    }
    const merged = applyCanvasModeOverrides(base, { b: { x: 500, y: 240 } })

    expect(merged).toEqual({
      a: { x: 40, y: 72 },
      b: { x: 500, y: 240 }
    })
    expect(base.b).toEqual({ x: 310, y: 72 })
  })

  it('routes links around blocking cards with elbow paths', () => {
    const route = routeBetweenCards(
      { x: 0, y: 0 },
      { x: 520, y: 0 },
      [{ left: 240, right: 450, top: -14, bottom: 126 }]
    )

    expect(route.length).toBeGreaterThan(2)
    expect(route[0]).toEqual({ x: 210, y: 56 })
    expect(route[route.length - 1]).toEqual({ x: 520, y: 56 })
    expect(route.some((point) => point.y !== 56)).toBe(true)
  })
})
