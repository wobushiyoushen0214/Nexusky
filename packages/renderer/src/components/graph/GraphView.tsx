import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { getErrorMessage, isCancellationError } from '../../utils/errors'
import { ConfirmModal } from '../ConfirmModal'
import { GraphPanel } from './GraphPanel'
import { buildGraphGroupColorMap } from './graph-colors'
import {
  DEFAULT_GRAPH_DISPLAY_STATE,
  buildGraphRelationLinkCountMap,
  getGraphCanvasWorld,
  getGraphFolderNodeId,
  getGraphNodeGroupId,
  getNodeRadius,
  isGraphCrossClusterRelation,
  isGraphLabelHidden,
  isGraphNodeHiddenByDisplay,
  isGraphNodeHiddenByGroup,
  seedGraphNodeFallbackPositions,
  shouldUseGraphRasterRenderer,
  type GraphCanvasWorld,
  type SimLink,
  type SimNode
} from './graph-types'
import type { GraphData, GraphEdge, GraphMode, GraphNode } from '@shared/types/ipc'
import './GraphView.css'

const GRAPH_MIN_ZOOM = 0.18
const GRAPH_MAX_ZOOM = 2.4
const GRAPH_FOCUS_ZOOM = 1.15
const DEFAULT_GRAPH_WORLD: GraphCanvasWorld = getGraphCanvasWorld(1200, 800, 1)

interface GraphCanvasNode extends SimNode {
  noteCount?: number
  directNoteCount?: number
  childFolderCount?: number
}

interface GraphLayoutState {
  nodes: GraphCanvasNode[]
  links: SimLink[]
  world: GraphCanvasWorld
  layoutKey: string
}

interface GraphPanState {
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

interface GraphDragState {
  id: string
  offsetX: number
  offsetY: number
  startClientX: number
  startClientY: number
  moved: boolean
}

interface GraphZoomAnchor {
  graphX: number
  graphY: number
  focalX: number
  focalY: number
  zoom: number
}

type PositionedGraphCanvasNode = GraphCanvasNode & { x: number; y: number }

interface GraphRenderableLink {
  link: SimLink
  source: PositionedGraphCanvasNode
  target: PositionedGraphCanvasNode
  sourceId: string
  targetId: string
  index: number
}

type GraphForceWorkerMessage =
  | { type: 'tick'; payload: Array<string | number>; alpha: number }
  | { type: 'end' }

function getLinkEndpointId(endpoint: string | SimNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

function getLinkEndpoint(endpoint: string | SimNode, nodeMap: ReadonlyMap<string, GraphCanvasNode>): GraphCanvasNode | null {
  return typeof endpoint === 'string' ? nodeMap.get(endpoint) ?? null : endpoint as GraphCanvasNode
}

function hasPosition(node: GraphCanvasNode | null): node is GraphCanvasNode & { x: number; y: number } {
  return !!node && node.x != null && node.y != null
}

function getGraphNodeFill(node: { type: 'file' | 'folder'; color?: string }): string {
  if (!node.color) return 'var(--bg-base)'
  const mix = node.type === 'folder' ? 28 : 18
  return `color-mix(in srgb, ${node.color} ${mix}%, var(--bg-base))`
}

function getGraphNodeColor(node: GraphCanvasNode): string {
  return node.color || (node.type === 'folder' ? 'var(--accent)' : 'var(--text-tertiary)')
}

function getGraphNodeRing(node: GraphCanvasNode): string {
  if (!node.colors || node.colors.length < 2) return getGraphNodeColor(node)
  const step = 100 / node.colors.length
  const stops = node.colors.map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`)
  return `conic-gradient(${stops.join(', ')})`
}

function getGraphNodeSize(node: GraphCanvasNode): number {
  if (node.type === 'folder') {
    const count = node.noteCount ?? node.directNoteCount ?? node.linkCount
    return Math.max(58, Math.min(86, 58 + Math.sqrt(Math.max(count, 0)) * 5))
  }
  return Math.max(18, getNodeRadius(node) * 2 + 10)
}

function getGraphNodeEdgeRadius(node: GraphCanvasNode): number {
  if (node.type === 'folder') return getGraphNodeSize(node) / 2
  return getNodeRadius(node)
}

function formatGraphNodeCount(count: number): string {
  if (count >= 1000) return `${Math.floor(count / 100) / 10}k`
  if (count >= 100) return '99+'
  return String(count)
}

function getGraphEdgeWidth(link: SimLink): number {
  if (link.linkType === 'folder') return 1
  return Math.min(2.6, 1.05 + ((link.weight ?? 1) - 1) * 0.25)
}

function isLinkTypeVisible(link: SimLink, options: {
  showExplicitEdges: boolean
  showInferredEdges: boolean
  showFolderEdges: boolean
}): boolean {
  if (link.linkType === 'explicit') return options.showExplicitEdges
  if (link.linkType === 'inferred') return options.showInferredEdges
  if (link.linkType === 'folder') return options.showFolderEdges
  return true
}

function buildGraphCanvasData(
  graphData: GraphData,
  groupColorMap: ReadonlyMap<string, string>,
  activeFolderPath: string | null,
): { nodes: GraphCanvasNode[]; links: SimLink[] } {
  const linkCountMap = buildGraphRelationLinkCountMap(graphData.edges)
  const folderIdSet = new Set(graphData.nodes.filter((n: GraphNode) => n.type === 'folder').map((n: GraphNode) => n.id))
  const nodeToFolder = new Map<string, string>()
  graphData.nodes.forEach((node: GraphNode) => {
    if (node.type === 'file' && node.folder != null) {
      nodeToFolder.set(node.id, getGraphFolderNodeId(node.folder))
    }
  })
  graphData.edges.forEach((edge: GraphEdge) => {
    if (folderIdSet.has(edge.source) && !folderIdSet.has(edge.target) && !nodeToFolder.has(edge.target)) {
      nodeToFolder.set(edge.target, edge.source)
    }
  })

  const nodeCount = graphData.nodes.length
  const nodesForLayout = nodeCount > 500
    ? graphData.nodes.filter((n: GraphNode) => n.type === 'folder' || (linkCountMap.get(n.id) || 0) > 0)
    : graphData.nodes

  const incomingColorsMap = new Map<string, Set<string>>()
  graphData.edges.forEach((edge: GraphEdge) => {
    if (edge.source === edge.target) return
    if (edge.linkType === 'folder') return
    const sourceFolderId = folderIdSet.has(edge.source) ? edge.source : nodeToFolder.get(edge.source)
    if (!sourceFolderId) return
    const sourceColor = groupColorMap.get(sourceFolderId)
    if (!sourceColor) return
    const colors = incomingColorsMap.get(edge.target) ?? new Set<string>()
    colors.add(sourceColor)
    incomingColorsMap.set(edge.target, colors)
  })

  const nodes: GraphCanvasNode[] = nodesForLayout.map((node: GraphNode) => {
    const folderId = getGraphNodeGroupId(node, nodeToFolder, activeFolderPath)
    const color = folderId ? groupColorMap.get(folderId) : undefined
    const incomingColors = incomingColorsMap.get(node.id)
    const colorSet = new Set<string>()
    if (color) colorSet.add(color)
    if (incomingColors) incomingColors.forEach((item) => colorSet.add(item))
    const colors = [...colorSet]
    return {
      ...node,
      linkCount: linkCountMap.get(node.id) || 0,
      group: folderId,
      color: colors.length > 0 ? colors[0] : undefined,
      colors: colors.length > 1 ? colors : undefined,
    }
  })

  const nodeIds = new Set(nodes.map((node) => node.id))
  const links: SimLink[] = graphData.edges
    .filter((edge: GraphEdge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge: GraphEdge) => ({ source: edge.source, target: edge.target, linkType: edge.linkType, weight: edge.weight }))

  return { nodes, links }
}

function getCurrentRelPath(currentFilePath: string | null, vaultPath: string | null): string {
  if (!currentFilePath || !vaultPath) return ''
  return currentFilePath
    .replace(`${vaultPath}/`, '')
    .replace(`${vaultPath}\\`, '')
}

function clampGraphZoom(value: number): number {
  return Math.max(GRAPH_MIN_ZOOM, Math.min(GRAPH_MAX_ZOOM, value))
}

interface GraphRasterCanvasProps {
  viewportRef: RefObject<HTMLDivElement | null>
  world: GraphCanvasWorld
  nodes: PositionedGraphCanvasNode[]
  folderLinks: GraphRenderableLink[]
  relationLinks: GraphRenderableLink[]
  zoomValue: number
  showLabels: boolean
  showArrows: boolean
  hoveredNodeId: string | null
  connectedNodeIds: ReadonlySet<string>
  normalizedSearchQuery: string
  currentRelPath: string
}

interface GraphRasterPalette {
  bgBase: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
  accent: string
}

interface GraphRasterDrawOptions extends GraphRasterCanvasProps {
  palette: GraphRasterPalette
  viewport: HTMLDivElement
  width: number
  height: number
}

function getGraphCssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim()
  return value || fallback
}

function resolveGraphCanvasColor(value: string | undefined, styles: CSSStyleDeclaration, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  const match = trimmed.match(/^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/)
  if (!match) return trimmed
  return getGraphCssVar(styles, match[1], match[2]?.trim() || fallback)
}

function getGraphRasterPoint(
  node: PositionedGraphCanvasNode,
  world: GraphCanvasWorld,
  viewport: HTMLDivElement,
  zoom: number,
): { x: number; y: number } {
  return {
    x: (node.x - world.minX) * zoom - viewport.scrollLeft,
    y: (node.y - world.minY) * zoom - viewport.scrollTop,
  }
}

function graphRasterSegmentTouchesViewport(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
  margin: number,
): boolean {
  return (
    Math.max(x1, x2) >= -margin &&
    Math.min(x1, x2) <= width + margin &&
    Math.max(y1, y2) >= -margin &&
    Math.min(y1, y2) <= height + margin
  )
}

function graphRasterPointTouchesViewport(
  x: number,
  y: number,
  radius: number,
  width: number,
  height: number,
): boolean {
  return x + radius >= 0 && x - radius <= width && y + radius >= 0 && y - radius <= height
}

function truncateGraphCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let next = text
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1)
  }
  return `${next}...`
}

function drawGraphRasterLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: { maxWidth: number; color: string; alpha: number; fontSize: number; weight?: number },
): void {
  if (!text) return
  ctx.save()
  ctx.globalAlpha = options.alpha
  ctx.fillStyle = options.color
  ctx.font = `${options.weight ?? 500} ${options.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(truncateGraphCanvasText(ctx, text, options.maxWidth), x, y)
  ctx.restore()
}

function drawGraphRasterLink(
  ctx: CanvasRenderingContext2D,
  item: GraphRenderableLink,
  styles: CSSStyleDeclaration,
  options: GraphRasterDrawOptions,
): void {
  const { link, source, target, sourceId, targetId } = item
  const sourcePoint = getGraphRasterPoint(source, options.world, options.viewport, options.zoomValue)
  const targetPoint = getGraphRasterPoint(target, options.world, options.viewport, options.zoomValue)
  if (!graphRasterSegmentTouchesViewport(sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y, options.width, options.height, 96)) return

  const dx = targetPoint.x - sourcePoint.x
  const dy = targetPoint.y - sourcePoint.y
  const distance = Math.sqrt(dx * dx + dy * dy) || 1
  const sourceRadius = getGraphNodeEdgeRadius(source) * options.zoomValue
  const targetRadius = getGraphNodeEdgeRadius(target) * options.zoomValue
  const x1 = sourcePoint.x + (dx / distance) * sourceRadius
  const y1 = sourcePoint.y + (dy / distance) * sourceRadius
  const x2 = targetPoint.x - (dx / distance) * targetRadius
  const y2 = targetPoint.y - (dy / distance) * targetRadius
  const lineLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
  if (lineLength < 1) return

  const sourceColor = resolveGraphCanvasColor(source.color, styles, options.palette.textTertiary)
  const targetColor = resolveGraphCanvasColor(target.color, styles, sourceColor)
  const isCrossCluster = isGraphCrossClusterRelation(link, source, target)
  const isHoverDimmed = options.hoveredNodeId != null && options.hoveredNodeId !== sourceId && options.hoveredNodeId !== targetId
  const isHighlighted = options.hoveredNodeId === sourceId || options.hoveredNodeId === targetId
  let alpha = link.linkType === 'folder' ? 0.1 : link.linkType === 'inferred' ? 0.11 : 0.2
  if (isCrossCluster && link.linkType === 'explicit') alpha = 0.42
  if (isCrossCluster && link.linkType === 'inferred') alpha = 0.26
  if (isHighlighted) alpha = 0.78
  if (isHoverDimmed) alpha = 0.035

  let strokeStyle: string | CanvasGradient = sourceColor
  if (isCrossCluster && link.linkType !== 'inferred') {
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
    gradient.addColorStop(0, sourceColor)
    gradient.addColorStop(1, targetColor)
    strokeStyle = gradient
  }

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = Math.max(0.65, getGraphEdgeWidth(link) * options.zoomValue)
  ctx.lineCap = 'round'
  if (link.linkType === 'inferred') {
    const dash = Math.max(2, 5 * options.zoomValue)
    ctx.setLineDash([dash, dash])
  }
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  if (options.showArrows && link.linkType !== 'folder' && lineLength > 14) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const arrowLength = Math.max(5, 7 * options.zoomValue)
    const arrowWidth = Math.max(3, 4 * options.zoomValue)
    ctx.setLineDash([])
    ctx.fillStyle = targetColor
    ctx.translate(x2, y2)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-arrowLength, -arrowWidth)
    ctx.lineTo(-arrowLength, arrowWidth)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function drawGraphRasterNode(
  ctx: CanvasRenderingContext2D,
  node: PositionedGraphCanvasNode,
  styles: CSSStyleDeclaration,
  options: GraphRasterDrawOptions,
): void {
  const point = getGraphRasterPoint(node, options.world, options.viewport, options.zoomValue)
  const nodeSize = getGraphNodeSize(node)
  const nodeRadius = node.type === 'folder'
    ? (nodeSize / 2) * options.zoomValue
    : Math.max(2, getNodeRadius(node) * options.zoomValue)
  const viewportRadius = Math.max(nodeRadius + 72, 24)
  if (!graphRasterPointTouchesViewport(point.x, point.y, viewportRadius, options.width, options.height)) return

  const isCurrent = node.filePath === options.currentRelPath
  const isHovered = options.hoveredNodeId === node.id
  const isConnected = options.connectedNodeIds.has(node.id)
  const isSearchMatch = !!options.normalizedSearchQuery && node.title.toLowerCase().includes(options.normalizedSearchQuery)
  const isSearchDimmed = !!options.normalizedSearchQuery && !isSearchMatch
  const isHoverDimmed = options.hoveredNodeId != null && !isHovered && !isConnected
  const opacity = isSearchDimmed || isHoverDimmed ? 0.12 : 1
  const nodeColor = resolveGraphCanvasColor(getGraphNodeColor(node), styles, options.palette.accent)
  const ringColors = node.colors && node.colors.length > 1
    ? node.colors.map((color) => resolveGraphCanvasColor(color, styles, nodeColor))
    : [nodeColor]

  ctx.save()
  if (node.type === 'folder') {
    ctx.globalAlpha = opacity * 0.34
    ctx.fillStyle = nodeColor
    ctx.beginPath()
    ctx.arc(point.x, point.y, Math.max(16, nodeRadius), 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = opacity * 0.86
    ctx.fillStyle = options.palette.bgBase
    ctx.beginPath()
    ctx.arc(point.x, point.y, Math.max(12, nodeRadius * 0.72), 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = opacity * (isHovered || isCurrent ? 0.86 : 0.48)
    ctx.strokeStyle = nodeColor
    ctx.lineWidth = isHovered || isCurrent ? 1.8 : 1.1
    ctx.beginPath()
    ctx.arc(point.x, point.y, Math.max(16, nodeRadius), 0, Math.PI * 2)
    ctx.stroke()

    const folderCount = node.noteCount ?? node.directNoteCount ?? node.linkCount
    if (folderCount > 0 && nodeRadius >= 14) {
      drawGraphRasterLabel(ctx, formatGraphNodeCount(folderCount), point.x, point.y, {
        maxWidth: Math.max(28, nodeRadius * 1.5),
        color: options.palette.textPrimary,
        alpha: opacity * 0.86,
        fontSize: Math.max(8, Math.min(12, 10 * options.zoomValue)),
        weight: 650,
      })
    }

    drawGraphRasterLabel(ctx, node.title, point.x, point.y + Math.max(18, nodeRadius + 11 * options.zoomValue), {
      maxWidth: Math.max(72, 160 * options.zoomValue),
      color: options.palette.textSecondary,
      alpha: opacity * 0.82,
      fontSize: Math.max(8, Math.min(12, 10.5 * options.zoomValue)),
      weight: 650,
    })
    ctx.restore()
    return
  }

  ctx.globalAlpha = opacity
  ctx.fillStyle = options.palette.bgBase
  ctx.beginPath()
  ctx.arc(point.x, point.y, nodeRadius, 0, Math.PI * 2)
  ctx.fill()

  const ringRadius = nodeRadius + Math.max(1.5, 2 * options.zoomValue)
  ctx.lineWidth = Math.max(1, 1.4 * options.zoomValue)
  if (ringColors.length > 1) {
    const segment = (Math.PI * 2) / ringColors.length
    ringColors.forEach((color, index) => {
      ctx.globalAlpha = opacity * 0.9
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.arc(point.x, point.y, ringRadius, index * segment, (index + 1) * segment)
      ctx.stroke()
    })
  } else {
    ctx.globalAlpha = opacity * (isHovered || isCurrent ? 0.95 : 0.58)
    ctx.strokeStyle = nodeColor
    ctx.beginPath()
    ctx.arc(point.x, point.y, ringRadius, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (isCurrent || isHovered) {
    ctx.globalAlpha = opacity * 0.44
    ctx.strokeStyle = nodeColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(point.x, point.y, ringRadius + Math.max(5, 8 * options.zoomValue), 0, Math.PI * 2)
    ctx.stroke()
  }

  const labelHidden = isGraphLabelHidden(node, options.showLabels, isCurrent, {
    zoom: options.zoomValue,
    nodeCount: options.nodes.length,
    isHovered,
    isConnected,
    isSearchMatch,
  })
  if (!labelHidden) {
    drawGraphRasterLabel(ctx, node.title, point.x, point.y + Math.max(13, ringRadius + 8 * options.zoomValue), {
      maxWidth: Math.max(72, 160 * options.zoomValue),
      color: isCurrent || isHovered ? options.palette.textPrimary : options.palette.textSecondary,
      alpha: opacity * (isCurrent || isHovered ? 1 : 0.78),
      fontSize: Math.max(8, Math.min(12, (isCurrent ? 11 : 9.5) * options.zoomValue)),
      weight: isCurrent ? 650 : 500,
    })
  }

  ctx.restore()
}

function GraphRasterCanvas(props: GraphRasterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestPropsRef = useRef(props)
  const scheduleRenderRef = useRef<() => void>(() => {})

  useEffect(() => {
    latestPropsRef.current = props
    scheduleRenderRef.current()
  }, [props])

  useEffect(() => {
    const canvas = canvasRef.current
    const viewport = props.viewportRef.current
    if (!canvas || !viewport) return

    let rafId: number | null = null
    const render = () => {
      rafId = null
      const current = latestPropsRef.current
      const width = viewport.clientWidth
      const height = viewport.clientHeight
      if (width <= 0 || height <= 0) return

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.max(1, Math.floor(width * pixelRatio))
      const nextHeight = Math.max(1, Math.floor(height * pixelRatio))
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const styles = getComputedStyle(viewport)
      const palette: GraphRasterPalette = {
        bgBase: getGraphCssVar(styles, '--bg-base', 'rgb(17, 19, 24)'),
        textPrimary: getGraphCssVar(styles, '--text-primary', 'rgb(232, 236, 242)'),
        textSecondary: getGraphCssVar(styles, '--text-secondary', 'rgb(178, 186, 198)'),
        textTertiary: getGraphCssVar(styles, '--text-tertiary', 'rgb(129, 140, 153)'),
        accent: getGraphCssVar(styles, '--accent', 'rgb(87, 143, 255)'),
      }
      const options: GraphRasterDrawOptions = { ...current, viewport, width, height, palette }

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      current.folderLinks.forEach((link) => drawGraphRasterLink(ctx, link, styles, options))
      current.relationLinks.forEach((link) => drawGraphRasterLink(ctx, link, styles, options))
      current.nodes.forEach((node) => drawGraphRasterNode(ctx, node, styles, options))
    }

    const scheduleRender = () => {
      if (rafId != null) return
      rafId = window.requestAnimationFrame(render)
    }

    scheduleRenderRef.current = scheduleRender
    scheduleRender()
    viewport.addEventListener('scroll', scheduleRender, { passive: true })
    window.addEventListener('resize', scheduleRender)
    const resizeObserver = new ResizeObserver(scheduleRender)
    resizeObserver.observe(viewport)
    return () => {
      viewport.removeEventListener('scroll', scheduleRender)
      window.removeEventListener('resize', scheduleRender)
      resizeObserver.disconnect()
      if (rafId != null) window.cancelAnimationFrame(rafId)
      scheduleRenderRef.current = () => {}
    }
  }, [props.viewportRef])

  return <canvas ref={canvasRef} className="graph-canvas-raster" aria-hidden="true" />
}

export function GraphView() {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const nodeMapRef = useRef<Map<string, GraphCanvasNode>>(new Map())
  const lastKnownNodePositionsRef = useRef<Map<string, [number, number]>>(new Map())
  const graphBuiltForRef = useRef<string | null>(null)
  const graphRequestIdRef = useRef(0)
  const aiStopRequestedRef = useRef(false)
  const autoInferAttemptedRef = useRef<string | null>(null)
  const silentMemoryRefreshRef = useRef(false)
  const worldRef = useRef<GraphCanvasWorld>(DEFAULT_GRAPH_WORLD)
  const zoomRef = useRef(1)
  const desiredZoomRef = useRef(1)
  const pendingZoomAnchorRef = useRef<GraphZoomAnchor | null>(null)
  const initialScrollKeyRef = useRef<string | null>(null)
  const dragStateRef = useRef<GraphDragState | null>(null)
  const currentRelPathRef = useRef('')

  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const setMainView = useUIStore((s) => s.setMainView)

  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [layout, setLayout] = useState<GraphLayoutState>({
    nodes: [],
    links: [],
    world: DEFAULT_GRAPH_WORLD,
    layoutKey: '',
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [minLinks, setMinLinks] = useState(0)
  const [showLabels, setShowLabels] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showLabels)
  const [showOrphans, setShowOrphans] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showOrphans)
  const [showArrows, setShowArrows] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showArrows)
  const [showFolders, setShowFolders] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showFolders)
  const [showExplicitEdges, setShowExplicitEdges] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showExplicitEdges)
  const [showInferredEdges, setShowInferredEdges] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showInferredEdges)
  const [showFolderEdges, setShowFolderEdges] = useState(DEFAULT_GRAPH_DISPLAY_STATE.showFolderEdges)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [indexStatus, setIndexStatus] = useState<string | null>(null)
  const [confirmInferOpen, setConfirmInferOpen] = useState(false)
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(() => new Set())
  const [zoomValue, setZoomValue] = useState(1)
  const [panning, setPanning] = useState<GraphPanState | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  const activeFolderPath: string | null = null
  const activeGraphMode: GraphMode = 'folder'
  const graphScopeKey = 'flat-folder'
  const currentRelPath = useMemo(() => getCurrentRelPath(currentFilePath, vaultPath), [currentFilePath, vaultPath])

  useEffect(() => {
    currentRelPathRef.current = currentRelPath
  }, [currentRelPath])

  useEffect(() => {
    worldRef.current = layout.world
  }, [layout.world])

  const applyGraphScrollAnchor = useCallback((anchor: GraphZoomAnchor, zoom: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const world = worldRef.current
    viewport.scrollLeft = Math.max(0, (anchor.graphX - world.minX) * zoom - anchor.focalX)
    viewport.scrollTop = Math.max(0, (anchor.graphY - world.minY) * zoom - anchor.focalY)
  }, [])

  useLayoutEffect(() => {
    zoomRef.current = zoomValue
    desiredZoomRef.current = zoomValue
    const anchor = pendingZoomAnchorRef.current
    if (!anchor || Math.abs(anchor.zoom - zoomValue) > 0.001) return
    pendingZoomAnchorRef.current = null
    applyGraphScrollAnchor(anchor, zoomValue)
  }, [applyGraphScrollAnchor, zoomValue])

  const groupColorMap = useMemo(() => {
    if (!graphData) return new Map<string, string>()
    const seeds = new Map<string, { id: string; seed: string }>()
    graphData.nodes.forEach((node: GraphNode) => {
      if (node.type === 'folder') {
        seeds.set(node.id, { id: node.id, seed: node.filePath || node.id })
        return
      }
      if (node.folder != null) {
        const folderId = getGraphFolderNodeId(node.folder)
        if (!seeds.has(folderId)) {
          seeds.set(folderId, { id: folderId, seed: node.folder || '.' })
        }
      }
    })
    return buildGraphGroupColorMap([...seeds.values()])
  }, [graphData])

  const loadGraph = useCallback(() => {
    if (!vaultPath) return
    const requestId = ++graphRequestIdRef.current
    window.api.invoke('db:get-graph', { vaultPath, mode: activeGraphMode, rootPath: '' }).then((data) => {
      if (requestId === graphRequestIdRef.current) setGraphData(data)
    })
  }, [activeGraphMode, vaultPath])

  useEffect(() => {
    graphRequestIdRef.current += 1
    setGraphData(null)
    setLayout((current) => ({ ...current, nodes: [], links: [], layoutKey: '' }))
  }, [vaultPath])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  useEffect(() => {
    if (!vaultPath) return
    const refresh = () => loadGraph()
    const cleanup = window.api.onVaultChanged(refresh)
    const cleanupFile = window.api.onFileChanged(refresh)
    window.addEventListener('graph-data-updated', refresh)
    return () => { cleanup(); cleanupFile(); window.removeEventListener('graph-data-updated', refresh) }
  }, [loadGraph, vaultPath])

  useEffect(() => {
    if (!vaultPath || !graphData) return
    if (autoInferAttemptedRef.current === vaultPath) return

    autoInferAttemptedRef.current = vaultPath
    let cancelled = false
    ;(async () => {
      silentMemoryRefreshRef.current = true
      try {
        await window.api.invoke('ai:generate-memories', { vaultPath })
        if (cancelled) return
        const result = await window.api.invoke('ai:infer-global-links', { vaultPath })
        if (cancelled) return
        if (result.success) {
          window.dispatchEvent(new CustomEvent('graph-data-updated'))
        }
      } catch {}
      finally {
        if (!cancelled) silentMemoryRefreshRef.current = false
      }
    })()

    return () => {
      cancelled = true
      silentMemoryRefreshRef.current = false
    }
  }, [vaultPath, graphData])

  useEffect(() => {
    if (!graphData) return
    const knownGroupIds = new Set<string>(groupColorMap.keys())
    graphData.nodes.forEach((node: GraphNode) => {
      if (node.type === 'folder') knownGroupIds.add(node.id)
    })
    setHiddenGroupIds((current) => {
      let changed = false
      const next = new Set<string>()
      for (const groupId of current) {
        if (knownGroupIds.has(groupId)) next.add(groupId)
        else changed = true
      }
      return changed ? next : current
    })
  }, [graphData, groupColorMap])

  const toggleGroupVisibility = useCallback((groupId: string) => {
    setHiddenGroupIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const openGraphOverview = useCallback(() => {
    setGraphData(null)
    setHiddenGroupIds(new Set())
    loadGraph()
  }, [loadGraph])

  const openParentGraphFolder = useCallback(() => {
    openGraphOverview()
  }, [openGraphOverview])

  useEffect(() => {
    const cleanup = window.api.onAiMemoryProgress((data: { current: number; total: number; generated: number; skipped: number; failed: number; title?: string; state: 'running' | 'done' }) => {
      if (silentMemoryRefreshRef.current) return
      if (aiStopRequestedRef.current) return
      if (data.state === 'done') return
      const title = data.title ? t('graph.memory.progressTitle', { title: data.title }) : ''
      setIndexStatus(t('graph.memory.progress', { current: data.current, total: data.total, title }))
    })
    return () => cleanup()
  }, [t])

  const runGlobalInference = async () => {
    if (!vaultPath) return
    aiStopRequestedRef.current = false
    setConfirmInferOpen(false)
    setIndexStatus(t('common.aiAnalyzing'))
    try {
      const result = await window.api.invoke('ai:infer-global-links', { vaultPath })
      if (result.success) {
        setIndexStatus(t('common.semanticFound', { count: result.added }))
        window.dispatchEvent(new CustomEvent('graph-data-updated'))
      } else if (result.error && isCancellationError(result.error)) {
        setIndexStatus('已停止 AI 分析')
      } else {
        setIndexStatus(result.error || t('common.semanticFailed'))
      }
    } catch (e: unknown) {
      setIndexStatus(isCancellationError(e) ? '已停止 AI 分析' : getErrorMessage(e, t('common.semanticFailed')))
    }
    setTimeout(() => setIndexStatus(null), 3000)
  }

  const scrollToGraphPoint = useCallback((x: number, y: number, nextZoom: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const clamped = clampGraphZoom(nextZoom)
    const anchor: GraphZoomAnchor = {
      graphX: x,
      graphY: y,
      focalX: viewport.clientWidth / 2,
      focalY: viewport.clientHeight / 2,
      zoom: clamped,
    }
    pendingZoomAnchorRef.current = anchor
    desiredZoomRef.current = clamped
    if (Math.abs(zoomRef.current - clamped) < 0.001) {
      pendingZoomAnchorRef.current = null
      applyGraphScrollAnchor(anchor, clamped)
      return
    }
    setZoomValue(clamped)
  }, [applyGraphScrollAnchor])

  const zoomAtViewportPoint = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current
    const clamped = clampGraphZoom(nextZoom)
    if (!viewport) {
      zoomRef.current = clamped
      desiredZoomRef.current = clamped
      setZoomValue(clamped)
      return
    }
    const rect = viewport.getBoundingClientRect()
    const focalClientX = clientX ?? rect.left + viewport.clientWidth / 2
    const focalClientY = clientY ?? rect.top + viewport.clientHeight / 2
    const focalX = focalClientX - rect.left
    const focalY = focalClientY - rect.top
    const world = worldRef.current
    const currentZoom = zoomRef.current
    const graphX = (viewport.scrollLeft + focalX) / currentZoom + world.minX
    const graphY = (viewport.scrollTop + focalY) / currentZoom + world.minY

    const anchor: GraphZoomAnchor = { graphX, graphY, focalX, focalY, zoom: clamped }
    pendingZoomAnchorRef.current = anchor
    desiredZoomRef.current = clamped
    if (Math.abs(zoomRef.current - clamped) < 0.001) {
      pendingZoomAnchorRef.current = null
      applyGraphScrollAnchor(anchor, clamped)
      return
    }
    setZoomValue(clamped)
  }, [applyGraphScrollAnchor])

  const graphReady = !!graphData && graphData.nodes.length > 0

  // 缩放走原生非被动 wheel 监听：React 合成 onWheel 是被动的，preventDefault 失效，
  // 会让 Electron 原生 ctrl/⌘+滚轮页面缩放与本组件缩放叠加而抖动。同时按帧合并，
  // 避免高频滚轮每次都触发整图重渲染 + reflow。
  useEffect(() => {
    if (!graphReady) return
    const viewport = viewportRef.current
    if (!viewport) return

    let rafId: number | null = null
    let focusX: number | undefined
    let focusY: number | undefined

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      desiredZoomRef.current = clampGraphZoom(desiredZoomRef.current * Math.exp(-delta * 0.002))
      focusX = event.clientX
      focusY = event.clientY
      if (rafId != null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        zoomAtViewportPoint(desiredZoomRef.current, focusX, focusY)
      })
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', handleWheel)
      if (rafId != null) window.cancelAnimationFrame(rafId)
    }
  }, [graphReady, zoomAtViewportPoint])

  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return

    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' })
      workerRef.current.terminate()
      workerRef.current = null
    }

    const graphDataKey = `${vaultPath ?? ''}:${graphScopeKey}:${JSON.stringify(graphData)}`
    const isSameGraph = graphBuiltForRef.current === graphDataKey
    const viewport = viewportRef.current
    const width = viewport?.clientWidth || 1200
    const height = viewport?.clientHeight || 800

    const { nodes, links } = buildGraphCanvasData(graphData, groupColorMap, activeFolderPath)
    seedGraphNodeFallbackPositions(nodes, width, height)

    const nodeMap = new Map<string, GraphCanvasNode>()
    nodes.forEach((node) => {
      nodeMap.set(node.id, node)
      if (node.x != null && node.y != null) {
        lastKnownNodePositionsRef.current.set(node.id, [node.x, node.y])
      }
    })
    nodeMapRef.current = nodeMap

    const world = getGraphCanvasWorld(width, height, nodes.length)
    worldRef.current = world
    setLayout({ nodes: [...nodes], links, world, layoutKey: graphDataKey })

    let cleanupWorker: (() => void) | undefined
    if (nodes.length > 1) {
      let pendingFrame = false
      let stopped = false
      const worker = new Worker(new URL('../../workers/graph-force-worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker

      const flushPositions = () => {
        if (stopped) return
        setLayout((current) => {
          if (current.layoutKey !== graphDataKey) return current
          return { ...current, nodes: [...nodes] }
        })
      }

      worker.onmessage = (event: MessageEvent<GraphForceWorkerMessage>) => {
        const data = event.data
        if (data.type === 'end') {
          flushPositions()
          return
        }
        for (let index = 0; index < data.payload.length; index += 3) {
          const id = data.payload[index] as string
          const node = nodeMap.get(id)
          if (!node) continue
          node.x = data.payload[index + 1] as number
          node.y = data.payload[index + 2] as number
          lastKnownNodePositionsRef.current.set(id, [node.x, node.y])
        }
        if (pendingFrame) return
        pendingFrame = true
        window.requestAnimationFrame(() => {
          pendingFrame = false
          flushPositions()
        })
      }

      const isLarge = nodes.length > 220
      const isHeavy = nodes.length > 90
      const relationLinkCount = links.length
      worker.postMessage({
        type: 'start',
        nodes: nodes.map((node) => ({
          id: node.id,
          linkCount: node.linkCount,
          type: node.type,
          x: node.x,
          y: node.y,
        })),
        links: links.map((link) => ({
          source: typeof link.source === 'string' ? link.source : link.source.id,
          target: typeof link.target === 'string' ? link.target : link.target.id,
        })),
        width,
        height,
        params: {
          chargeStrength: isLarge ? -220 : -380,
          linkDistance: relationLinkCount > nodes.length ? 80 : 110,
          centerStrength: isLarge ? 0.005 : 0.01,
          isLarge,
          isHeavy,
        },
      })

      cleanupWorker = () => {
        stopped = true
        worker.postMessage({ type: 'stop' })
        worker.terminate()
        if (workerRef.current === worker) workerRef.current = null
      }
    }

    if (!isSameGraph) {
      window.requestAnimationFrame(() => {
        const currentNode = nodes.find((node) => node.filePath === currentRelPathRef.current)
        if (currentNode?.x == null || currentNode.y == null) return
        scrollToGraphPoint(currentNode.x, currentNode.y, GRAPH_FOCUS_ZOOM)
      })
    }

    graphBuiltForRef.current = graphDataKey
    return cleanupWorker
  }, [activeFolderPath, graphData, graphScopeKey, groupColorMap, scrollToGraphPoint, vaultPath])

  useEffect(() => {
    if (!layout.layoutKey || layout.nodes.length === 0) return
    const key = `${vaultPath ?? ''}:${layout.layoutKey}`
    if (initialScrollKeyRef.current === key) return
    initialScrollKeyRef.current = key
    const viewport = viewportRef.current
    if (!viewport) return
    window.requestAnimationFrame(() => {
      const world = worldRef.current
      const graphCenterX = viewport.clientWidth / 2
      const graphCenterY = viewport.clientHeight / 2
      viewport.scrollLeft = Math.max(0, (graphCenterX - world.minX) * zoomRef.current - viewport.clientWidth / 2)
      viewport.scrollTop = Math.max(0, (graphCenterY - world.minY) * zoomRef.current - viewport.clientHeight / 2)
    })
  }, [layout.layoutKey, layout.nodes.length, vaultPath])

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphCanvasNode>()
    layout.nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [layout.nodes])

  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>()
    layout.nodes.forEach((node) => {
      if (isGraphNodeHiddenByGroup(node, hiddenGroupIds) || isGraphNodeHiddenByDisplay(node, { showFolders, showOrphans, minLinks })) {
        hidden.add(node.id)
      }
    })
    return hidden
  }, [hiddenGroupIds, layout.nodes, minLinks, showFolders, showOrphans])

  const connectedNodeIds = useMemo(() => {
    const connected = new Set<string>()
    if (!hoveredNodeId) return connected
    layout.links.forEach((link) => {
      const sourceId = getLinkEndpointId(link.source)
      const targetId = getLinkEndpointId(link.target)
      if (sourceId === hoveredNodeId) connected.add(targetId)
      if (targetId === hoveredNodeId) connected.add(sourceId)
    })
    return connected
  }, [hoveredNodeId, layout.links])

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const visibleLinks = useMemo(() => {
    const next: GraphRenderableLink[] = []
    layout.links.forEach((link, index) => {
      if (!isLinkTypeVisible(link, { showExplicitEdges, showInferredEdges, showFolderEdges })) return
      const sourceId = getLinkEndpointId(link.source)
      const targetId = getLinkEndpointId(link.target)
      if (hiddenNodeIds.has(sourceId) || hiddenNodeIds.has(targetId)) return
      const source = getLinkEndpoint(link.source, nodeMap)
      const target = getLinkEndpoint(link.target, nodeMap)
      if (!hasPosition(source) || !hasPosition(target)) return
      next.push({ link, source, target, sourceId, targetId, index })
    })
    return next
  }, [hiddenNodeIds, layout.links, nodeMap, showExplicitEdges, showFolderEdges, showInferredEdges])

  const folderVisibleLinks = useMemo(
    () => visibleLinks.filter(({ link }) => link.linkType === 'folder'),
    [visibleLinks]
  )

  const relationVisibleLinks = useMemo(
    () => visibleLinks.filter(({ link }) => link.linkType !== 'folder'),
    [visibleLinks]
  )

  const visibleNodes = useMemo(
    () => layout.nodes.filter((node): node is PositionedGraphCanvasNode => hasPosition(node) && !hiddenNodeIds.has(node.id)),
    [hiddenNodeIds, layout.nodes]
  )

  const usesRasterGraph = shouldUseGraphRasterRenderer({
    visibleNodeCount: visibleNodes.length,
    visibleLinkCount: visibleLinks.length,
  })

  const getGraphPointFromPointer = useCallback((event: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
    const viewport = viewportRef.current
    if (!viewport) return null
    const rect = viewport.getBoundingClientRect()
    const world = worldRef.current
    const zoom = zoomRef.current
    return {
      x: (viewport.scrollLeft + event.clientX - rect.left) / zoom + world.minX,
      y: (viewport.scrollTop + event.clientY - rect.top) / zoom + world.minY,
    }
  }, [])

  const getRasterNodeFromPointer = useCallback((event: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
    const point = getGraphPointFromPointer(event)
    if (!point) return null
    let bestNode: PositionedGraphCanvasNode | null = null
    let bestDistance = Infinity
    for (let index = visibleNodes.length - 1; index >= 0; index--) {
      const node = visibleNodes[index]
      const radius = Math.max(node.type === 'folder' ? getGraphNodeSize(node) / 2 : getGraphNodeSize(node) / 2, 14)
      const dx = point.x - node.x
      const dy = point.y - node.y
      const distance = dx * dx + dy * dy
      if (distance > radius * radius || distance >= bestDistance) continue
      bestDistance = distance
      bestNode = node
    }
    return bestNode
  }, [getGraphPointFromPointer, visibleNodes])

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    const node = nodeMapRef.current.get(id)
    if (!node) return
    node.x = x
    node.y = y
    lastKnownNodePositionsRef.current.set(id, [x, y])
    setLayout((current) => {
      if (!current.nodes.some((item) => item.id === id)) return current
      return { ...current, nodes: [...current.nodes] }
    })
  }, [])

  const activateGraphNode = useCallback((nodeId: string) => {
    if (!vaultPath) return
    const node = nodeMapRef.current.get(nodeId)
    if (!node) return
    if (node.type === 'folder') {
      return
    }
    if (node.filePath) {
      setMainView('editor')
      requestAnimationFrame(() => {
        openFile(`${vaultPath}/${node.filePath}`)
      })
    }
  }, [openFile, setMainView, vaultPath])

  useEffect(() => {
    if (!draggingNodeId) return
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) return
      const point = getGraphPointFromPointer(event)
      if (!point) return
      const dx = event.clientX - dragState.startClientX
      const dy = event.clientY - dragState.startClientY
      if (!dragState.moved && Math.sqrt(dx * dx + dy * dy) > 3) {
        dragState.moved = true
      }
      const x = point.x - dragState.offsetX
      const y = point.y - dragState.offsetY
      updateNodePosition(dragState.id, x, y)
      workerRef.current?.postMessage({ type: 'drag-move', id: dragState.id, x, y })
    }
    const handlePointerUp = () => {
      const dragState = dragStateRef.current
      if (dragState) {
        workerRef.current?.postMessage({ type: 'drag-end', id: dragState.id })
        if (!dragState.moved) activateGraphNode(dragState.id)
      }
      dragStateRef.current = null
      setDraggingNodeId(null)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [activateGraphNode, draggingNodeId, getGraphPointFromPointer, updateNodePosition])

  useEffect(() => {
    if (!panning) return
    const handlePointerMove = (event: PointerEvent) => {
      const viewport = viewportRef.current
      if (!viewport) return
      viewport.scrollLeft = panning.scrollLeft - (event.clientX - panning.startX)
      viewport.scrollTop = panning.scrollTop - (event.clientY - panning.startY)
    }
    const handlePointerUp = () => setPanning(null)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [panning])

  const handleNodePointerDown = (event: ReactPointerEvent<HTMLElement>, node: GraphCanvasNode) => {
    if (event.button !== 0) return
    const point = getGraphPointFromPointer(event.nativeEvent)
    if (!point) return
    const x = node.x ?? point.x
    const y = node.y ?? point.y
    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = {
      id: node.id,
      offsetX: point.x - x,
      offsetY: point.y - y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    }
    setDraggingNodeId(node.id)
    workerRef.current?.postMessage({ type: 'drag-start', id: node.id, x, y })
  }

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-graph-node]')) return
    if (target.closest('button,input,textarea,select,a')) return
    if (event.button !== 0 && event.button !== 1) return
    if (usesRasterGraph) {
      const hitNode = getRasterNodeFromPointer(event.nativeEvent)
      if (hitNode) {
        handleNodePointerDown(event, hitNode)
        return
      }
    }
    const viewport = viewportRef.current
    if (!viewport) return
    event.preventDefault()
    setPanning({
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    })
  }

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!usesRasterGraph || panning || draggingNodeId) return
    const hitNode = getRasterNodeFromPointer(event.nativeEvent)
    setHoveredNodeId((current) => current === (hitNode?.id ?? null) ? current : hitNode?.id ?? null)
  }

  const handleCanvasPointerLeave = () => {
    if (!usesRasterGraph || draggingNodeId) return
    setHoveredNodeId(null)
  }

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const visibleNodes = layout.nodes.filter((node) => !hiddenNodeIds.has(node.id) && node.x != null && node.y != null)
    if (visibleNodes.length === 0) return
    const bounds = visibleNodes.reduce(
      (acc, node) => {
        const radius = node.type === 'folder' ? 68 : Math.max(24, getNodeRadius(node) + 20)
        return {
          minX: Math.min(acc.minX, (node.x ?? 0) - radius),
          minY: Math.min(acc.minY, (node.y ?? 0) - radius),
          maxX: Math.max(acc.maxX, (node.x ?? 0) + radius),
          maxY: Math.max(acc.maxY, (node.y ?? 0) + radius),
        }
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    )
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const nextZoom = clampGraphZoom(Math.min(1.55, (viewport.clientWidth - 96) / width, (viewport.clientHeight - 96) / height))
    scrollToGraphPoint(bounds.minX + width / 2, bounds.minY + height / 2, nextZoom)
  }, [hiddenNodeIds, layout.nodes, scrollToGraphPoint])

  const canvasWorldStyle = {
    width: layout.world.width * zoomValue,
    height: layout.world.height * zoomValue,
  }
  const scaledWorldStyle = {
    width: layout.world.width,
    height: layout.world.height,
    transform: `scale(${zoomValue})`,
  }

  const renderGraphEdge = ({ link, source, target, sourceId, targetId, index }: GraphRenderableLink) => {
    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.sqrt(dx * dx + dy * dy) || 1
    const sourceRadius = getGraphNodeEdgeRadius(source)
    const targetRadius = getGraphNodeEdgeRadius(target)
    const x1 = source.x + (dx / distance) * sourceRadius
    const y1 = source.y + (dy / distance) * sourceRadius
    const x2 = target.x - (dx / distance) * targetRadius
    const y2 = target.y - (dy / distance) * targetRadius
    const length = Math.max(1, Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2))
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
    const edgeColor = source.color || target.color || 'var(--text-tertiary)'
    const edgeTargetColor = target.color || source.color || 'var(--text-tertiary)'
    const isCrossCluster = isGraphCrossClusterRelation(link, source, target)
    const isHoverDimmed = hoveredNodeId != null && hoveredNodeId !== sourceId && hoveredNodeId !== targetId
    const isHighlighted = hoveredNodeId === sourceId || hoveredNodeId === targetId
    const style = {
      left: x1 - layout.world.minX,
      top: y1 - layout.world.minY,
      width: length,
      transform: `rotate(${angle}deg)`,
      '--edge-color': edgeColor,
      '--edge-target-color': edgeTargetColor,
      '--edge-width': `${getGraphEdgeWidth(link)}px`,
    } as CSSProperties
    return (
      <div
        key={`${sourceId}->${targetId}:${link.linkType}:${index}`}
        className={`graph-canvas-edge link-${link.linkType}${isCrossCluster ? ' is-cross-cluster' : ''}${showArrows ? ' has-arrow' : ''}${isHighlighted ? ' is-highlighted' : ''}${isHoverDimmed ? ' is-dimmed' : ''}`}
        style={style}
      />
    )
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-inner">
          <p className="graph-empty-title">{t('graph.emptyTitle')}</p>
          <p className="graph-empty-hint">{t('graph.emptyHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="graph-container">
      <GraphPanel
        collapsed={panelCollapsed}
        onToggleCollapsed={setPanelCollapsed}
        graphData={graphData}
        groupColorMap={groupColorMap}
        vaultPath={vaultPath}
        activeFolderPath={activeFolderPath}
        onOpenOverview={openGraphOverview}
        onOpenParentFolder={openParentGraphFolder}
        hiddenGroupIds={hiddenGroupIds}
        onToggleGroup={toggleGroupVisibility}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        minLinks={minLinks}
        setMinLinks={setMinLinks}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        showOrphans={showOrphans}
        setShowOrphans={setShowOrphans}
        showArrows={showArrows}
        setShowArrows={setShowArrows}
        showFolders={showFolders}
        setShowFolders={setShowFolders}
        showExplicitEdges={showExplicitEdges}
        setShowExplicitEdges={setShowExplicitEdges}
        showInferredEdges={showInferredEdges}
        setShowInferredEdges={setShowInferredEdges}
        showFolderEdges={showFolderEdges}
        setShowFolderEdges={setShowFolderEdges}
        indexStatus={indexStatus}
        setIndexStatus={setIndexStatus}
        onOpenInferConfirm={() => setConfirmInferOpen(true)}
        onStartAi={() => {
          aiStopRequestedRef.current = false
          silentMemoryRefreshRef.current = false
        }}
        onStopAi={() => {
          aiStopRequestedRef.current = true
          window.api.invoke('ai:stop', undefined).catch(() => {})
          setIndexStatus(t('graph.memory.stopRequested'))
        }}
        onBackToEditor={() => setMainView('editor')}
      />

      <div className="graph-canvas-stage">
        <div
          ref={viewportRef}
          className={`graph-canvas-viewport${panning ? ' is-panning' : ''}${usesRasterGraph ? ' uses-raster' : ''}${usesRasterGraph && hoveredNodeId ? ' has-node-hover' : ''}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerLeave={handleCanvasPointerLeave}
        >
          <div className="graph-canvas-world" style={canvasWorldStyle}>
            {!usesRasterGraph && (
              <div className="graph-canvas-scaled" style={scaledWorldStyle}>
                <div className="graph-canvas-edge-layer" aria-hidden="true">
                  {folderVisibleLinks.map(renderGraphEdge)}
                </div>

                <div className="graph-canvas-node-layer">
                  {layout.nodes.map((node) => {
                    if (!hasPosition(node) || hiddenNodeIds.has(node.id)) return null
                    const isCurrent = node.filePath === currentRelPath
                    const isSearchDimmed = !!normalizedSearchQuery && !node.title.toLowerCase().includes(normalizedSearchQuery)
                    const isHoverDimmed = hoveredNodeId != null && hoveredNodeId !== node.id && !connectedNodeIds.has(node.id)
                    const nodeSize = getGraphNodeSize(node)
                    const nodeStyle = {
                      left: node.x - layout.world.minX,
                      top: node.y - layout.world.minY,
                      '--node-size': `${nodeSize}px`,
                      '--node-core-size': `${Math.max(8, getNodeRadius(node) * 2)}px`,
                      '--node-color': getGraphNodeColor(node),
                      '--node-ring': getGraphNodeRing(node),
                      '--node-fill': getGraphNodeFill(node),
                    } as CSSProperties
                    const labelHidden = isGraphLabelHidden(node, showLabels, isCurrent, {
                      zoom: zoomValue,
                      nodeCount: layout.nodes.length,
                      isHovered: hoveredNodeId === node.id,
                      isConnected: connectedNodeIds.has(node.id),
                      isSearchMatch: !!normalizedSearchQuery && !isSearchDimmed,
                    })
                    const folderCount = node.noteCount ?? node.directNoteCount ?? node.linkCount
                    return (
                      <button
                        key={node.id}
                        data-graph-node
                        type="button"
                        className={`graph-canvas-node ${node.type}${isCurrent ? ' is-current' : ''}${isSearchDimmed || isHoverDimmed ? ' is-dimmed' : ''}${draggingNodeId === node.id ? ' is-dragging' : ''}`}
                        style={nodeStyle}
                        title={node.filePath || node.title}
                        onPointerDown={(event) => handleNodePointerDown(event, node)}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId((current) => current === node.id ? null : current)}
                      >
                        {node.type === 'folder' ? (
                          <>
                            <span className="graph-canvas-folder-dot" />
                            <span className="graph-canvas-folder-title">{node.title}</span>
                            {folderCount > 0 && (
                              <span className="graph-canvas-folder-count">{formatGraphNodeCount(folderCount)}</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="graph-canvas-node-core" />
                            <span className={`graph-canvas-node-label${isCurrent ? ' active' : ''}${labelHidden ? ' hidden' : ''}`}>{node.title}</span>
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="graph-canvas-relation-edge-layer" aria-hidden="true">
                  {relationVisibleLinks.map(renderGraphEdge)}
                </div>
              </div>
            )}
          </div>
        </div>

        {usesRasterGraph && (
          <GraphRasterCanvas
            viewportRef={viewportRef}
            world={layout.world}
            nodes={visibleNodes}
            folderLinks={folderVisibleLinks}
            relationLinks={relationVisibleLinks}
            zoomValue={zoomValue}
            showLabels={showLabels}
            showArrows={showArrows}
            hoveredNodeId={hoveredNodeId}
            connectedNodeIds={connectedNodeIds}
            normalizedSearchQuery={normalizedSearchQuery}
            currentRelPath={currentRelPath}
          />
        )}

        <div className="graph-canvas-toolbar">
          <button type="button" title={t('canvas.zoomOut')} onClick={() => zoomAtViewportPoint(desiredZoomRef.current / 1.16)}>-</button>
          <button type="button" className="graph-canvas-zoom-readout" title={t('canvas.zoomReset')} onClick={() => zoomAtViewportPoint(1)}>{Math.round(zoomValue * 100)}%</button>
          <button type="button" title={t('canvas.zoomIn')} onClick={() => zoomAtViewportPoint(desiredZoomRef.current * 1.16)}>+</button>
          <button type="button" title={t('canvas.fitView')} onClick={fitToView}>Fit</button>
        </div>
      </div>

      <ConfirmModal
        open={confirmInferOpen}
        title="重新计算语义关联"
        message="将重新计算全库语义关联，并替换现有的 AI 推理链接。是否继续？"
        confirmText="重新计算"
        onConfirm={runGlobalInference}
        onCancel={() => setConfirmInferOpen(false)}
      />
    </div>
  )
}
