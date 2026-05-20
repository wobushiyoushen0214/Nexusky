interface CanvasPosition {
  x: number
  y: number
}

type RoutePoint = { x: number; y: number }
type RouteSide = 'left' | 'right' | 'top' | 'bottom'
type RoutePort = { side: RouteSide; edge: RoutePoint; clear: RoutePoint }
type CanvasEdgeRoute = { key: string; source: string; target: string; points: RoutePoint[] }
type CanvasAssociationReason = 'tag' | 'source' | 'title'
type CanvasSuggestedEdgeRoute = CanvasAssociationSuggestion & CanvasEdgeRoute

interface CanvasAssociationSuggestion {
  source: string
  target: string
  reason: CanvasAssociationReason
  score: number
}

interface RouteWorkerMessage {
  generation: number
  positions: Record<string, CanvasPosition>
  metrics: { minX: number; minY: number }
  rows: Array<{ id: string; fallbackIndex: number }>
  edges: Array<{ source: string; target: string }>
  suggestions: CanvasAssociationSuggestion[]
}

const CARD_WIDTH = 210
const CARD_HEIGHT = 112
const CARD_GAP = 32
const ROUTE_CLEARANCE = 52
const ROUTE_CARD_PADDING = 26
const ROUTE_SIDE_MISMATCH_PENALTY = 360

function defaultPosition(index: number): CanvasPosition {
  const column = index % 4
  const row = Math.floor(index / 4)
  return { x: 40 + column * 250, y: 40 + row * 170 }
}

function centerOf(position: CanvasPosition): RoutePoint {
  return {
    x: position.x + CARD_WIDTH / 2,
    y: position.y + CARD_HEIGHT / 2
  }
}

function distanceBetween(a: RoutePoint, b: RoutePoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function cardRect(position: CanvasPosition, padding = ROUTE_CARD_PADDING) {
  return {
    left: position.x - padding,
    right: position.x + CARD_WIDTH + padding,
    top: position.y - padding,
    bottom: position.y + CARD_HEIGHT + padding
  }
}

function cardPorts(position: CanvasPosition, offset = ROUTE_CLEARANCE): RoutePort[] {
  const center = centerOf(position)
  return [
    { side: 'right', edge: { x: position.x + CARD_WIDTH, y: center.y }, clear: { x: position.x + CARD_WIDTH + offset, y: center.y } },
    { side: 'left', edge: { x: position.x, y: center.y }, clear: { x: position.x - offset, y: center.y } },
    { side: 'bottom', edge: { x: center.x, y: position.y + CARD_HEIGHT }, clear: { x: center.x, y: position.y + CARD_HEIGHT + offset } },
    { side: 'top', edge: { x: center.x, y: position.y }, clear: { x: center.x, y: position.y - offset } }
  ]
}

function preferredSide(from: CanvasPosition, to: CanvasPosition): RouteSide {
  const fromCenter = centerOf(from)
  const toCenter = centerOf(to)
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function pointInRect(point: RoutePoint, rect: ReturnType<typeof cardRect>): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

function segmentCrossesRect(a: RoutePoint, b: RoutePoint, rect: ReturnType<typeof cardRect>): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true
  if (a.y === b.y) {
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    return a.y >= rect.top && a.y <= rect.bottom && maxX >= rect.left && minX <= rect.right
  }
  if (a.x === b.x) {
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    return a.x >= rect.left && a.x <= rect.right && maxY >= rect.top && minY <= rect.bottom
  }
  return false
}

function routeCrossesCards(points: RoutePoint[], blockers: ReturnType<typeof cardRect>[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (blockers.some((rect) => segmentCrossesRect(points[i], points[i + 1], rect))) return true
  }
  return false
}

function routeLength(points: RoutePoint[]): number {
  return points.reduce((total, point, index) => index === 0 ? 0 : total + distanceBetween(points[index - 1], point), 0)
}

function routeBends(points: RoutePoint[]): number {
  let bends = 0
  for (let index = 1; index < points.length - 1; index++) {
    const prev = points[index - 1]
    const point = points[index]
    const next = points[index + 1]
    const prevHorizontal = prev.y === point.y
    const nextHorizontal = point.y === next.y
    if (prevHorizontal !== nextHorizontal) bends++
  }
  return bends
}

function compactRoute(points: RoutePoint[]): RoutePoint[] {
  const deduped = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y)
  return deduped.filter((point, index) => {
    if (index === 0 || index === deduped.length - 1) return true
    const prev = deduped[index - 1]
    const next = deduped[index + 1]
    return !((prev.x === point.x && point.x === next.x) || (prev.y === point.y && point.y === next.y))
  })
}

function findOrthogonalRoute(start: RoutePoint, end: RoutePoint, blockers: ReturnType<typeof cardRect>[]): RoutePoint[] | null {
  if ((start.x === end.x || start.y === end.y) && !routeCrossesCards([start, end], blockers)) return [start, end]
  const xs = new Set<number>([start.x, end.x])
  const ys = new Set<number>([start.y, end.y])
  for (const rect of blockers) {
    xs.add(rect.left - ROUTE_CLEARANCE)
    xs.add(rect.right + ROUTE_CLEARANCE)
    ys.add(rect.top - ROUTE_CLEARANCE)
    ys.add(rect.bottom + ROUTE_CLEARANCE)
  }
  const xValues = Array.from(xs).sort((a, b) => a - b)
  const yValues = Array.from(ys).sort((a, b) => a - b)
  const nodes = new Map<string, RoutePoint>()
  for (const x of xValues) {
    for (const y of yValues) {
      const point = { x, y }
      if (!blockers.some((rect) => pointInRect(point, rect))) nodes.set(`${x},${y}`, point)
    }
  }
  const startKey = `${start.x},${start.y}`
  const endKey = `${end.x},${end.y}`
  nodes.set(startKey, start)
  nodes.set(endKey, end)
  const nodeKeys = Array.from(nodes.keys())
  const queue = [startKey]
  const visited = new Set<string>([startKey])
  const previous = new Map<string, string>()
  const neighbors = (key: string): string[] => {
    const point = nodes.get(key)
    if (!point) return []
    const candidates = nodeKeys.map((candidateKey) => nodes.get(candidateKey)!).filter((candidate) => candidate.x === point.x || candidate.y === point.y)
    const next: string[] = []
    for (const direction of [-1, 1]) {
      const horizontal = candidates
        .filter((candidate) => candidate.y === point.y && (candidate.x - point.x) * direction > 0)
        .sort((a, b) => Math.abs(a.x - point.x) - Math.abs(b.x - point.x))
      const vertical = candidates
        .filter((candidate) => candidate.x === point.x && (candidate.y - point.y) * direction > 0)
        .sort((a, b) => Math.abs(a.y - point.y) - Math.abs(b.y - point.y))
      for (const candidate of [...horizontal, ...vertical]) {
        if (candidate && !routeCrossesCards([point, candidate], blockers)) next.push(`${candidate.x},${candidate.y}`)
      }
    }
    return next
  }
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === endKey) break
    for (const next of neighbors(current)) {
      if (visited.has(next)) continue
      visited.add(next)
      previous.set(next, current)
      queue.push(next)
    }
  }
  if (visited.has(endKey)) {
    const route: RoutePoint[] = []
    let current = endKey
    while (current) {
      const point = nodes.get(current)
      if (point) route.unshift(point)
      const prev = previous.get(current)
      if (!prev) break
      current = prev
    }
    const compact = compactRoute(route)
    if (!routeCrossesCards(compact, blockers)) return compact
  }
  return null
}

function routeBetweenCards(source: CanvasPosition, target: CanvasPosition, blockers: ReturnType<typeof cardRect>[]): RoutePoint[] {
  const sourcePorts = cardPorts(source)
  const targetPorts = cardPorts(target)
  const sourcePreferred = preferredSide(source, target)
  const targetPreferred = preferredSide(target, source)
  const candidates = sourcePorts.flatMap((sourcePort) => targetPorts.map((targetPort) => {
    const innerRoute = findOrthogonalRoute(sourcePort.clear, targetPort.clear, blockers)
    if (!innerRoute) return null
    const route = compactRoute([sourcePort.edge, ...innerRoute, targetPort.edge])
    const penalty =
      (sourcePort.side === sourcePreferred ? 0 : ROUTE_SIDE_MISMATCH_PENALTY) +
      (targetPort.side === targetPreferred ? 0 : ROUTE_SIDE_MISMATCH_PENALTY)
    const score = routeLength(route) + routeBends(route) * 80 + penalty
    return { route, score }
  })).filter((candidate): candidate is { route: RoutePoint[]; score: number } => candidate !== null && !routeCrossesCards(candidate.route, blockers))

  if (candidates.length > 0) {
    return candidates.sort((a, b) => a.score - b.score)[0].route
  }

  const sourceEdge = cardPorts(source, 0).find((port) => port.side === sourcePreferred)?.edge || cardPorts(source, 0)[0].edge
  const targetEdge = cardPorts(target, 0).find((port) => port.side === targetPreferred)?.edge || cardPorts(target, 0)[0].edge
  const start = cardPorts(source).find((port) => port.side === sourcePreferred)?.clear || cardPorts(source)[0].clear
  const end = cardPorts(target).find((port) => port.side === targetPreferred)?.clear || cardPorts(target)[0].clear
  const fallbackCandidates = [
    [start, { x: start.x, y: Math.min(source.y, target.y) - 42 }, { x: end.x, y: Math.min(source.y, target.y) - 42 }, end],
    [start, { x: start.x, y: Math.max(source.y + CARD_HEIGHT, target.y + CARD_HEIGHT) + 42 }, { x: end.x, y: Math.max(source.y + CARD_HEIGHT, target.y + CARD_HEIGHT) + 42 }, end],
    [start, { x: Math.min(source.x, target.x) - 42, y: start.y }, { x: Math.min(source.x, target.x) - 42, y: end.y }, end],
    [start, { x: Math.max(source.x + CARD_WIDTH, target.x + CARD_WIDTH) + 42, y: start.y }, { x: Math.max(source.x + CARD_WIDTH, target.x + CARD_WIDTH) + 42, y: end.y }, end]
  ]
  const fallback = fallbackCandidates.find((route) => !routeCrossesCards(route, blockers)) || fallbackCandidates[0]
  return compactRoute([sourceEdge, ...fallback, targetEdge])
}

function getPosition(id: string, rows: RouteWorkerMessage['rows'], positions: Record<string, CanvasPosition>): CanvasPosition | null {
  const position = positions[id]
  if (position) return position
  const row = rows.find((item) => item.id === id)
  return row ? defaultPosition(row.fallbackIndex) : null
}

self.onmessage = (event: MessageEvent<RouteWorkerMessage>) => {
  const { generation, positions, metrics, rows, edges, suggestions } = event.data
  const blockers = rows.map((row) => ({
    id: row.id,
    rect: cardRect(positions[row.id] || defaultPosition(row.fallbackIndex))
  }))
  const routeEdge = (edge: { source: string; target: string }): CanvasEdgeRoute | null => {
    const source = getPosition(edge.source, rows, positions)
    const target = getPosition(edge.target, rows, positions)
    if (!source || !target) return null
    return {
      key: `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      points: routeBetweenCards(source, target, blockers.filter((blocker) => blocker.id !== edge.source && blocker.id !== edge.target).map((blocker) => blocker.rect)).map((point) => ({
        x: point.x - metrics.minX,
        y: point.y - metrics.minY
      }))
    }
  }
  const routeSuggestion = (edge: CanvasAssociationSuggestion): CanvasSuggestedEdgeRoute | null => {
    const source = getPosition(edge.source, rows, positions)
    const target = getPosition(edge.target, rows, positions)
    if (!source || !target) return null
    return {
      key: `${edge.source}~${edge.target}:${edge.reason}`,
      source: edge.source,
      target: edge.target,
      reason: edge.reason,
      score: edge.score,
      points: routeBetweenCards(source, target, blockers.filter((blocker) => blocker.id !== edge.source && blocker.id !== edge.target).map((blocker) => blocker.rect)).map((point) => ({
        x: point.x - metrics.minX,
        y: point.y - metrics.minY
      }))
    }
  }

  self.postMessage({
    generation,
    edges: edges.map(routeEdge).filter((edge): edge is CanvasEdgeRoute => edge !== null),
    suggestedEdges: suggestions.map(routeSuggestion).filter((edge): edge is CanvasSuggestedEdgeRoute => edge !== null)
  })
}

export {}
