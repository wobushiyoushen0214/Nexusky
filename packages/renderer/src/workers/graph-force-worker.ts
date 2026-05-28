import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'

interface WorkerNode {
  id: string
  linkCount: number
  type: 'file' | 'folder'
  x?: number
  y?: number
  anchorX?: number
  anchorY?: number
  fx?: number | null
  fy?: number | null
}

interface WorkerLink {
  source: string
  target: string
}

interface ForceParams {
  chargeStrength: number
  linkDistance: number
  centerStrength: number
  clusterStrength: number
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
let currentParams: ForceParams | null = null
let tickPending = false

function radiusFor(d: SimInternalNode): number {
  if (d.type === 'folder') return 38
  if (d.linkCount >= 8) return 12
  if (d.linkCount >= 5) return 9
  if (d.linkCount >= 3) return 7
  if (d.linkCount >= 1) return 5
  return 3
}

function clusterStrengthFor(d: SimInternalNode, params: ForceParams): number {
  if (d.anchorX == null || d.anchorY == null) return params.centerStrength
  return d.type === 'folder' ? params.clusterStrength * 1.45 : params.clusterStrength
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
  currentParams = params
  simulation = forceSimulation(currentNodes)
    .force('link', forceLink<SimInternalNode, WorkerLink>(currentLinks).id((d) => d.id).distance(params.isLarge ? 50 : params.linkDistance).strength(0.4))
    .force('charge', forceManyBody().strength(params.isLarge ? -150 : params.chargeStrength).distanceMax(params.isLarge ? 300 : 500))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collide', forceCollide<SimInternalNode>((d) => radiusFor(d) + (params.isLarge ? 10 : 18)).iterations(params.isLarge ? 1 : 2))
    .force('x', forceX(width / 2).strength(params.centerStrength))
    .force('y', forceY(height / 2).strength(params.centerStrength))
    .force('cluster-x', forceX<SimInternalNode>((d) => d.anchorX ?? width / 2).strength((d) => clusterStrengthFor(d, params)))
    .force('cluster-y', forceY<SimInternalNode>((d) => d.anchorY ?? height / 2).strength((d) => clusterStrengthFor(d, params)))

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
    if (!currentParams) return
    const params = msg.params
    currentParams = params
    const linkForce = simulation.force('link') as ReturnType<typeof forceLink<SimInternalNode, WorkerLink>> | undefined
    if (linkForce) linkForce.distance(params.isLarge ? 50 : params.linkDistance)
    const chargeForce = simulation.force('charge') as ReturnType<typeof forceManyBody> | undefined
    if (chargeForce) chargeForce.strength(params.isLarge ? -150 : params.chargeStrength).distanceMax(params.isLarge ? 300 : 500)
    const collideForce = simulation.force('collide') as ReturnType<typeof forceCollide<SimInternalNode>> | undefined
    if (collideForce) collideForce.radius((d) => radiusFor(d) + (params.isLarge ? 10 : 18)).iterations(params.isLarge ? 1 : 2)
    const xForce = simulation.force('x') as ReturnType<typeof forceX> | undefined
    if (xForce) xForce.strength(params.centerStrength)
    const yForce = simulation.force('y') as ReturnType<typeof forceY> | undefined
    if (yForce) yForce.strength(params.centerStrength)
    const clusterXForce = simulation.force('cluster-x') as ReturnType<typeof forceX<SimInternalNode>> | undefined
    if (clusterXForce) clusterXForce.strength((d) => clusterStrengthFor(d, params))
    const clusterYForce = simulation.force('cluster-y') as ReturnType<typeof forceY<SimInternalNode>> | undefined
    if (clusterYForce) clusterYForce.strength((d) => clusterStrengthFor(d, params))
    simulation.alpha(0.3).restart()
    return
  }
  if (msg.type === 'reheat') {
    simulation.alpha(msg.alpha).restart()
    return
  }
}

export {}
