import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'

interface WorkerNode {
  id: string
  linkCount: number
  type: 'file' | 'folder'
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

type WorkerLinkType = 'explicit' | 'inferred' | 'folder'

interface WorkerLink {
  source: string
  target: string
  linkType?: WorkerLinkType
}

interface ForceParams {
  chargeStrength: number
  linkDistance: number
  centerStrength: number
  isLarge: boolean
  isHeavy: boolean
}

interface SimInternalNode extends WorkerNode {
  vx?: number
  vy?: number
}

type InMsg =
  | { type: 'start'; nodes: WorkerNode[]; links: WorkerLink[]; width: number; height: number; params: ForceParams; startAlpha?: number }
  | { type: 'stop' }
  | { type: 'drag-start'; id: string; x: number; y: number }
  | { type: 'drag-move'; id: string; x: number; y: number }
  | { type: 'drag-end'; id: string }
  | { type: 'update-params'; params: ForceParams }
  | { type: 'reheat'; alpha: number }

interface OutTickEvent {
  type: 'tick'
  payload: Array<string | number>
  alpha: number
}

type OutMsg = OutTickEvent | { type: 'end' }

let simulation: ReturnType<typeof forceSimulation<SimInternalNode>> | null = null
let currentNodes: SimInternalNode[] = []
let currentLinks: WorkerLink[] = []
let degreeMap = new Map<string, number>()
let tickPending = false

function radiusFor(d: SimInternalNode): number {
  if (d.type === 'folder') return 38
  if (d.linkCount >= 8) return 12
  if (d.linkCount >= 5) return 9
  if (d.linkCount >= 3) return 7
  if (d.linkCount >= 1) return 5
  return 3
}

function endpointId(endpoint: string | SimInternalNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

function endpointNode(endpoint: string | SimInternalNode): SimInternalNode | null {
  return typeof endpoint === 'string' ? null : endpoint
}

function degreeOf(id: string): number {
  return Math.max(1, degreeMap.get(id) || 0)
}

function rebuildDegreeMap(): void {
  degreeMap = new Map<string, number>()
  for (const link of currentLinks) {
    degreeMap.set(link.source, (degreeMap.get(link.source) || 0) + 1)
    degreeMap.set(link.target, (degreeMap.get(link.target) || 0) + 1)
  }
}

/* Hub-heavy graphs collapse into knots when every link pulls with the same
   strength. Degree-aware distance/strength (Obsidian-style) lets dense hubs
   relax outward while folder links keep clusters compact. */
function linkDistanceFor(link: WorkerLink, params: ForceParams): number {
  const source = endpointNode(link.source as unknown as string | SimInternalNode)
  const target = endpointNode(link.target as unknown as string | SimInternalNode)
  const radii = (source ? radiusFor(source) : 5) + (target ? radiusFor(target) : 5)
  if (link.linkType === 'folder') {
    return (params.isLarge ? 46 : 58) + radii
  }
  const base = params.isLarge ? 72 : params.linkDistance
  const sourceDegree = degreeOf(endpointId(link.source as unknown as string | SimInternalNode))
  const targetDegree = degreeOf(endpointId(link.target as unknown as string | SimInternalNode))
  return base + radii + Math.min(48, (sourceDegree + targetDegree) * 3)
}

function linkStrengthFor(link: WorkerLink, params: ForceParams): number {
  if (link.linkType === 'folder') return params.isLarge ? 0.45 : 0.55
  const sourceDegree = degreeOf(endpointId(link.source as unknown as string | SimInternalNode))
  const targetDegree = degreeOf(endpointId(link.target as unknown as string | SimInternalNode))
  return Math.min(0.5, 1 / Math.min(sourceDegree, targetDegree))
}

function chargeStrengthFor(node: SimInternalNode, params: ForceParams): number {
  const base = params.isLarge ? -220 : params.chargeStrength
  if (node.type === 'folder') return base * 1.7
  return base * (0.6 + Math.min(node.linkCount, 10) * 0.08)
}

function collideRadiusFor(node: SimInternalNode, params: ForceParams): number {
  return radiusFor(node) + (params.isLarge ? 16 : 26)
}

function postTick(): void {
  if (!simulation || tickPending) return
  tickPending = true
  Promise.resolve().then(() => {
    tickPending = false
    if (!simulation) return
    const payload: Array<string | number> = []
    for (const node of currentNodes) {
      if (node.x == null || node.y == null) continue
      payload.push(node.id, node.x, node.y)
    }
    const msg: OutMsg = { type: 'tick', payload, alpha: simulation.alpha() }
    ;(self as unknown as Worker).postMessage(msg)
  })
}

function buildSimulation(width: number, height: number, params: ForceParams, startAlpha?: number): void {
  if (simulation) simulation.stop()
  rebuildDegreeMap()
  simulation = forceSimulation(currentNodes)
    .force('link', forceLink<SimInternalNode, WorkerLink>(currentLinks)
      .id((d) => d.id)
      .distance((l) => linkDistanceFor(l, params))
      .strength((l) => linkStrengthFor(l, params)))
    .force('charge', forceManyBody<SimInternalNode>()
      .strength((d) => chargeStrengthFor(d, params))
      .distanceMax(params.isLarge ? 380 : 640))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collide', forceCollide<SimInternalNode>((d) => collideRadiusFor(d, params)).iterations(2))
    .force('x', forceX(width / 2).strength(params.centerStrength))
    .force('y', forceY(height / 2).strength(params.centerStrength))

  if (params.isHeavy) {
    simulation.alphaDecay(0.05).velocityDecay(0.5)
  }

  if (typeof startAlpha === 'number') {
    simulation.alpha(startAlpha)
  } else {
    simulation.tick(params.isHeavy ? 60 : 120)
    postTick()
  }

  simulation.on('tick', postTick)
  simulation.on('end', () => {
    const msg: OutMsg = { type: 'end' }
    ;(self as unknown as Worker).postMessage(msg)
  })
}

self.onmessage = (event: MessageEvent<InMsg>): void => {
  const msg = event.data
  if (msg.type === 'start') {
    currentNodes = msg.nodes.map((n) => ({ ...n }))
    currentLinks = msg.links.map((l) => ({ ...l }))
    buildSimulation(msg.width, msg.height, msg.params, msg.startAlpha)
    return
  }
  if (msg.type === 'stop') {
    simulation?.stop()
    simulation = null
    currentNodes = []
    currentLinks = []
    return
  }
  if (!simulation) return
  if (msg.type === 'drag-start') {
    const n = currentNodes.find((c) => c.id === msg.id)
    if (n) { n.fx = msg.x; n.fy = msg.y }
    simulation.alphaTarget(0.3).restart()
    return
  }
  if (msg.type === 'drag-move') {
    const n = currentNodes.find((c) => c.id === msg.id)
    if (n) { n.fx = msg.x; n.fy = msg.y }
    return
  }
  if (msg.type === 'drag-end') {
    const n = currentNodes.find((c) => c.id === msg.id)
    if (n) { n.fx = null; n.fy = null }
    simulation.alphaTarget(0)
    return
  }
  if (msg.type === 'update-params') {
    const params = msg.params
    const linkForce = simulation.force('link') as ReturnType<typeof forceLink<SimInternalNode, WorkerLink>> | undefined
    if (linkForce) linkForce.distance((l) => linkDistanceFor(l, params)).strength((l) => linkStrengthFor(l, params))
    const chargeForce = simulation.force('charge') as ReturnType<typeof forceManyBody<SimInternalNode>> | undefined
    if (chargeForce) chargeForce.strength((d) => chargeStrengthFor(d, params)).distanceMax(params.isLarge ? 380 : 640)
    const collideForce = simulation.force('collide') as ReturnType<typeof forceCollide<SimInternalNode>> | undefined
    if (collideForce) collideForce.radius((d) => collideRadiusFor(d, params)).iterations(2)
    const xForce = simulation.force('x') as ReturnType<typeof forceX> | undefined
    if (xForce) xForce.strength(params.centerStrength)
    const yForce = simulation.force('y') as ReturnType<typeof forceY> | undefined
    if (yForce) yForce.strength(params.centerStrength)
    simulation.alpha(0.3).restart()
    return
  }
  if (msg.type === 'reheat') {
    simulation.alpha(msg.alpha).restart()
    return
  }
}

export {}
