import { describe, expect, it } from 'vitest'
import { appendCanvasAssociationLink, applyCanvasModeOverrides, buildArchivePositions, buildCanvasAssociationSuggestions, buildCanvasGroupLabels, buildCanvasModePositions, buildLightweightCanvasEdgeRoutes, buildLightweightCanvasSuggestedEdgeRoutes, findAvailablePosition, getCanvasAssociationWikilink, getCanvasInitialScrollKey, getNextCanvasAssociationKey, getViewportCenteredCardOrigin, mergeCanvasRouteUpdates, routeAnchorsCurrentCards, routeBetweenCards, routeBetweenCardsDuringDrag, routeCrossesCards } from '../packages/renderer/src/components/canvas/CanvasView'
import type { PropertyTableRow } from '../packages/shared/src/types/ipc'

function row(id: string, properties: PropertyTableRow['properties'], updatedAt = 1): PropertyTableRow {
  return {
    id,
    title: id,
    filePath: `${id}.md`,
    createdAt: updatedAt,
    updatedAt,
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
      { panX: -600, panY: -300, clientWidth: 800, clientHeight: 500 },
      { minX: -760, minY: -760 },
      1.25,
      0
    )

    expect(origin).toEqual({ x: -65, y: -386 })
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

    expect(Math.abs(positions['readwise-a'].x - positions['readwise-b'].x)).toBeLessThan(320)
    expect(Math.abs(positions.project.x - positions['readwise-a'].x)).toBeGreaterThanOrEqual(300)
  })

  it('leaves wider lanes after grouping so routed links have room around cards', () => {
    const positions = buildArchivePositions([
      row('readwise-a', { source: 'readwise' }),
      row('readwise-b', { source: 'readwise' }),
      row('readwise-c', { source: 'readwise' }),
      row('readwise-d', { source: 'readwise' }),
      row('project-a', { tags: ['project'] }),
      row('project-b', { tags: ['project'] })
    ])

    expect(Math.abs(positions['readwise-a'].x - positions['readwise-b'].x)).toBeGreaterThanOrEqual(280)
    expect(Math.abs(positions['readwise-d'].y - positions['readwise-a'].y)).toBeGreaterThanOrEqual(180)
    expect(Math.abs(positions['project-a'].x - positions['readwise-a'].x)).toBeGreaterThanOrEqual(1100)
  })

  it('rebuilds mode layouts from the current mode basis', () => {
    const rows = [
      row('react-a', { tags: ['react'] }, Date.parse('2026-05-20T08:00:00Z')),
      row('react-b', { tags: ['react'] }, Date.parse('2026-05-19T08:00:00Z')),
      row('vue-a', { tags: ['vue'] }, Date.parse('2026-05-20T09:00:00Z'))
    ]

    const properties = buildCanvasModePositions(rows, 'properties')
    expect(Math.abs(properties['react-a'].x - properties['react-b'].x)).toBeLessThan(320)
    expect(Math.abs(properties['vue-a'].x - properties['react-a'].x)).toBeGreaterThanOrEqual(300)

    const time = buildCanvasModePositions(rows, 'time')
    expect(Math.abs(time['react-a'].x - time['vue-a'].x)).toBeLessThan(320)
    expect(
      Math.abs(time['react-b'].x - time['react-a'].x) >= 300 ||
      Math.abs(time['react-b'].y - time['react-a'].y) >= 190
    ).toBe(true)
  })

  it('builds visible group labels from the active canvas layer', () => {
    const rows = [
      row('react-a', { tags: ['react'], source: 'readwise' }, Date.parse('2026-05-20T08:00:00Z')),
      row('react-b', { tags: ['react'], source: 'readwise' }, Date.parse('2026-05-20T09:00:00Z')),
      row('vue-a', { tags: ['vue'], source: 'pocket' }, Date.parse('2026-05-19T08:00:00Z'))
    ]

    const labels = buildCanvasGroupLabels(rows, buildCanvasModePositions(rows, 'properties'), 'properties')
    expect(labels).toContainEqual(expect.objectContaining({ kind: 'tag', value: 'react', count: 2 }))

    const propertyLabels = buildCanvasGroupLabels(rows, buildCanvasModePositions(rows, 'properties'), 'properties')
    expect(propertyLabels).toContainEqual(expect.objectContaining({ kind: 'tag', value: 'react', count: 2 }))

    const timeLabels = buildCanvasGroupLabels(rows, buildCanvasModePositions(rows, 'time'), 'time')
    expect(timeLabels).toContainEqual(expect.objectContaining({ kind: 'date', value: '2026-05-20', count: 2 }))
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
    const blocker = { left: 240, right: 450, top: -14, bottom: 146 }
    const route = routeBetweenCards(
      { x: 0, y: 0 },
      { x: 520, y: 0 },
      [blocker]
    )

    expect(route.length).toBeGreaterThan(2)
    expect(
      route[0].x === 210 ||
      route[0].x === 0 ||
      route[0].y === 0 ||
      route[0].y === 132
    ).toBe(true)
    expect(
      route[route.length - 1].x === 520 ||
      route[route.length - 1].x === 730 ||
      route[route.length - 1].y === 0 ||
      route[route.length - 1].y === 132
    ).toBe(true)
    expect(route.every((point, index) => index === 0 || point.x === route[index - 1].x || point.y === route[index - 1].y)).toBe(true)
    expect(route.some((point) => point.y !== 66)).toBe(true)
    expect(routeCrossesCards(route, [blocker])).toBe(false)
  })

  it('chooses a free card edge instead of forcing a blocked side', () => {
    const blockers = [
      { left: 224, right: 520, top: -14, bottom: 146 },
      { left: 238, right: 506, top: 180, bottom: 350 }
    ]
    const route = routeBetweenCards(
      { x: 0, y: 0 },
      { x: 560, y: 0 },
      blockers
    )

    expect(route[0].x === 210 || route[0].y === 0 || route[0].y === 132).toBe(true)
    expect(route[route.length - 1].x === 560 || route[route.length - 1].y === 0 || route[route.length - 1].y === 132).toBe(true)
    expect(route.every((point, index) => index === 0 || point.x === route[index - 1].x || point.y === route[index - 1].y)).toBe(true)
    expect(routeCrossesCards(route, blockers)).toBe(false)
  })

  it('uses a lightweight orthogonal route while a card is being dragged', () => {
    const route = routeBetweenCardsDuringDrag(
      { x: 0, y: 0 },
      { x: 520, y: 160 }
    )

    expect(route.length).toBeLessThanOrEqual(4)
    expect(route[0]).toEqual({ x: 210, y: 66 })
    expect(route[route.length - 1]).toEqual({ x: 520, y: 226 })
    expect(route.every((point, index) => index === 0 || point.x === route[index - 1].x || point.y === route[index - 1].y)).toBe(true)
  })

  it('seeds all visible canvas routes before worker refinement', () => {
    const positions = {
      a: { x: 0, y: 0 },
      b: { x: 520, y: 0 },
      c: { x: 0, y: 240 }
    }

    const edges = buildLightweightCanvasEdgeRoutes([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'missing', target: 'b' }
    ], positions, { minX: -40, minY: -80 })
    const suggestions = buildLightweightCanvasSuggestedEdgeRoutes([
      { source: 'b', target: 'c', reason: 'tag', score: 4 }
    ], positions, { minX: -40, minY: -80 })

    expect(edges.map((edge) => edge.key)).toEqual(['a->b', 'a->c'])
    expect(edges[0].points[0]).toEqual({ x: 250, y: 146 })
    expect(suggestions.map((edge) => edge.key)).toEqual(['b~c:tag'])
    expect(mergeCanvasRouteUpdates([], edges, new Set(edges.map((edge) => edge.key)))).toEqual(edges)
  })

  it('removes stale canvas routes while replacing touched route keys', () => {
    const current = [
      { key: 'stale', value: 1 },
      { key: 'a->b', value: 1 }
    ]
    const updates = [{ key: 'a->b', value: 2 }]

    expect(mergeCanvasRouteUpdates(current, updates, new Set(['a->b']), new Set(['a->b']))).toEqual(updates)
  })

  it('detects stale routes that no longer touch current card positions', () => {
    const source = { x: 0, y: 0 }
    const target = { x: 520, y: 160 }
    const route = routeBetweenCardsDuringDrag(source, target)

    expect(routeAnchorsCurrentCards(route, source, target)).toBe(true)
    expect(routeAnchorsCurrentCards(route, source, { x: 520, y: 360 })).toBe(false)
    expect(routeAnchorsCurrentCards(route.map((point) => ({ x: point.x - 40, y: point.y - 80 })), source, target, 40, 80)).toBe(true)
  })
})
