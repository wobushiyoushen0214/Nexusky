import { type PointerEvent as ReactPointerEvent, type WheelEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../stores/editor-store'
import { useUIStore } from '../../stores/ui-store'
import { useVaultStore } from '../../stores/vault-store'
import { toast } from '../../stores/toast-store'
import { safeGetJSON, safeRemove, safeSetJSON } from '../../utils/storage'
import './KnowledgeSpace.css'
import type { GraphData, PropertyTableRow } from '@shared/types/ipc'

interface CanvasPosition {
  x: number
  y: number
}

interface DragState {
  id: string
  offsetX: number
  offsetY: number
}

interface PanState {
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

interface PreferredPosition {
  filePath: string
  position: CanvasPosition
}

interface PendingScroll {
  left?: number
  top?: number
  focusX?: number
  focusY?: number
}

interface CanvasViewportState {
  x: number
  y: number
  zoom: number
}

interface CanvasMetrics {
  minX: number
  minY: number
  width: number
  height: number
}

interface CanvasViewportBox {
  scrollLeft: number
  scrollTop: number
  clientWidth: number
  clientHeight: number
}

type CanvasMode = 'space' | 'properties' | 'time'
type RoutePoint = { x: number; y: number }
type CanvasEdgeRoute = { key: string; points: RoutePoint[] }

interface PendingCanvasFocus {
  filePath: string
  mode?: CanvasMode
}

const CARD_WIDTH = 210
const CARD_HEIGHT = 112
const BASE_CANVAS_WIDTH = 1200
const BASE_CANVAS_HEIGHT = 760
const CANVAS_PADDING = 760
const CARD_GAP = 32
const ARCHIVE_CARD_GAP_X = 38
const ARCHIVE_CARD_GAP_Y = 42
const ARCHIVE_CLUSTER_GAP_X = 180
const ARCHIVE_CLUSTER_GAP_Y = 150
const ROUTE_CLEARANCE = 24
const PENDING_CANVAS_FOCUS_KEY = 'nexusky-pending-canvas-focus'

function getCanvasStorageKey(vaultPath: string): string {
  return `nexusky-canvas-layout:${encodeURIComponent(vaultPath)}`
}

function getCanvasViewportStorageKey(vaultPath: string): string {
  return `nexusky-canvas-viewport:${encodeURIComponent(vaultPath)}`
}

function getPendingCanvasFocus(): PendingCanvasFocus | null {
  const pending = safeGetJSON<Partial<PendingCanvasFocus> | null>(PENDING_CANVAS_FOCUS_KEY, null)
  if (!pending || typeof pending.filePath !== 'string' || !pending.filePath.trim()) return null
  const mode = pending.mode === 'space' || pending.mode === 'properties' || pending.mode === 'time' ? pending.mode : undefined
  return { filePath: pending.filePath, mode }
}

export function getCanvasInitialScrollKey(vaultPath: string | null | undefined): string {
  return vaultPath || 'no-vault'
}

function defaultPosition(index: number): CanvasPosition {
  const column = index % 4
  const row = Math.floor(index / 4)
  return { x: 40 + column * 250, y: 40 + row * 170 }
}

function cardsOverlap(a: CanvasPosition, b: CanvasPosition): boolean {
  return (
    a.x < b.x + CARD_WIDTH + CARD_GAP &&
    a.x + CARD_WIDTH + CARD_GAP > b.x &&
    a.y < b.y + CARD_HEIGHT + CARD_GAP &&
    a.y + CARD_HEIGHT + CARD_GAP > b.y
  )
}

export function findAvailablePosition(origin: CanvasPosition, occupied: CanvasPosition[]): CanvasPosition {
  const stepX = CARD_WIDTH + CARD_GAP
  const stepY = CARD_HEIGHT + CARD_GAP
  const candidates: CanvasPosition[] = [origin]
  for (let radius = 1; radius <= 12; radius++) {
    const ring: CanvasPosition[] = []
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        ring.push({
          x: origin.x + dx * stepX,
          y: origin.y + dy * stepY
        })
      }
    }
    ring.sort((a, b) => {
      const ax = (a.x - origin.x) / stepX
      const ay = (a.y - origin.y) / stepY
      const bx = (b.x - origin.x) / stepX
      const by = (b.y - origin.y) / stepY
      const scoreA = Math.abs(ay) * 4 + (ax < 0 ? 2 : 0) + (ay < 0 ? 1 : 0)
      const scoreB = Math.abs(by) * 4 + (bx < 0 ? 2 : 0) + (by < 0 ? 1 : 0)
      return scoreA - scoreB || Math.abs(ax) - Math.abs(bx)
    })
    candidates.push(...ring)
  }
  return candidates.find((candidate) => occupied.every((position) => !cardsOverlap(candidate, position))) || {
    x: origin.x + occupied.length * stepX,
    y: origin.y
  }
}

export function getViewportCenteredCardOrigin(viewport: CanvasViewportBox | null, metrics: Pick<CanvasMetrics, 'minX' | 'minY'>, zoom: number, fallbackIndex: number): CanvasPosition {
  if (!viewport) return defaultPosition(fallbackIndex)
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return {
    x: (viewport.scrollLeft + viewport.clientWidth / 2) / scale + metrics.minX - CARD_WIDTH / 2,
    y: (viewport.scrollTop + viewport.clientHeight / 2) / scale + metrics.minY - CARD_HEIGHT / 2
  }
}

function valueToText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function getTextValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

function getPrimaryTag(row: PropertyTableRow): string {
  return getTextValues(row.properties.tags)[0] || 'untagged'
}

function getArchiveGroup(row: PropertyTableRow): string {
  const source = valueToText(row.properties.source).toLowerCase()
  if (source) return `source:${source}`
  const status = valueToText(row.properties.status).toLowerCase()
  if (status && ['unread', 'to-read', 'todo', 'archived', 'read'].includes(status)) return `status:${status}`
  return `tag:${getPrimaryTag(row)}`
}

export function buildArchivePositions(rows: PropertyTableRow[]): Record<string, CanvasPosition> {
  const groups = new Map<string, PropertyTableRow[]>()
  for (const row of rows) {
    const key = getArchiveGroup(row)
    groups.set(key, [...(groups.get(key) || []), row])
  }
  const positions: Record<string, CanvasPosition> = {}
  const stepX = CARD_WIDTH + ARCHIVE_CARD_GAP_X
  const stepY = CARD_HEIGHT + ARCHIVE_CARD_GAP_Y
  const maxClusterWidth = stepX * 3 + ARCHIVE_CLUSTER_GAP_X
  const clusterHeights = [40, 40, 40]
  Array.from(groups.entries())
    .sort(([a, itemsA], [b, itemsB]) => itemsB.length - itemsA.length || a.localeCompare(b))
    .forEach(([, items], groupIndex) => {
      const lane = clusterHeights.indexOf(Math.min(...clusterHeights))
      const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(items.length))))
      const rowsInCluster = Math.ceil(items.length / columns)
      const originX = 40 + lane * maxClusterWidth
      const originY = clusterHeights[lane]
      items.forEach((row, index) => {
        const column = index % columns
        const itemRow = Math.floor(index / columns)
        const stagger = itemRow % 2 === 0 ? 0 : 16
        positions[row.id] = {
          x: originX + column * stepX + stagger,
          y: originY + itemRow * stepY
        }
      })
      clusterHeights[lane] = originY + rowsInCluster * stepY + ARCHIVE_CLUSTER_GAP_Y + (groupIndex % 2) * 28
    })
  return positions
}

function buildTimePositions(rows: PropertyTableRow[]): Record<string, CanvasPosition> {
  const dayRows = new Map<string, PropertyTableRow[]>()
  const sorted = [...rows].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  for (const row of sorted) {
    const key = row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : 'unknown'
    dayRows.set(key, [...(dayRows.get(key) || []), row])
  }
  const positions: Record<string, CanvasPosition> = {}
  Array.from(dayRows.entries()).forEach(([, items], column) => {
    items.forEach((row, index) => {
      positions[row.id] = { x: 40 + column * 270, y: 72 + index * 150 }
    })
  })
  return positions
}

function centerOf(position: CanvasPosition): RoutePoint {
  return {
    x: position.x + CARD_WIDTH / 2,
    y: position.y + CARD_HEIGHT / 2
  }
}

function cardRect(position: CanvasPosition, padding = 14) {
  return {
    left: position.x - padding,
    right: position.x + CARD_WIDTH + padding,
    top: position.y - padding,
    bottom: position.y + CARD_HEIGHT + padding
  }
}

function cardPort(from: CanvasPosition, to: CanvasPosition, offset = 0): RoutePoint {
  const fromCenter = centerOf(from)
  const toCenter = centerOf(to)
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? from.x + CARD_WIDTH + offset : from.x - offset, y: fromCenter.y }
  }
  return { x: fromCenter.x, y: dy >= 0 ? from.y + CARD_HEIGHT + offset : from.y - offset }
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

export function routeBetweenCards(source: CanvasPosition, target: CanvasPosition, blockers: ReturnType<typeof cardRect>[]): RoutePoint[] {
  const sourceEdge = cardPort(source, target)
  const targetEdge = cardPort(target, source)
  const start = cardPort(source, target, ROUTE_CLEARANCE)
  const end = cardPort(target, source, ROUTE_CLEARANCE)
  const sourceCenter = centerOf(source)
  const targetCenter = centerOf(target)
  const xs = new Set<number>([start.x, end.x, sourceCenter.x, targetCenter.x])
  const ys = new Set<number>([start.y, end.y, sourceCenter.y, targetCenter.y])
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
        .sort((a, b) => Math.abs(a.x - point.x) - Math.abs(b.x - point.x))[0]
      const vertical = candidates
        .filter((candidate) => candidate.x === point.x && (candidate.y - point.y) * direction > 0)
        .sort((a, b) => Math.abs(a.y - point.y) - Math.abs(b.y - point.y))[0]
      for (const candidate of [horizontal, vertical]) {
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
    if (!routeCrossesCards(compact, blockers)) return compactRoute([sourceEdge, ...compact, targetEdge])
  }
  const fallbackCandidates = [
    [start, { x: start.x, y: Math.min(source.y, target.y) - 42 }, { x: end.x, y: Math.min(source.y, target.y) - 42 }, end],
    [start, { x: start.x, y: Math.max(source.y + CARD_HEIGHT, target.y + CARD_HEIGHT) + 42 }, { x: end.x, y: Math.max(source.y + CARD_HEIGHT, target.y + CARD_HEIGHT) + 42 }, end],
    [start, { x: Math.min(source.x, target.x) - 42, y: start.y }, { x: Math.min(source.x, target.x) - 42, y: end.y }, end],
    [start, { x: Math.max(source.x + CARD_WIDTH, target.x + CARD_WIDTH) + 42, y: start.y }, { x: Math.max(source.x + CARD_WIDTH, target.x + CARD_WIDTH) + 42, y: end.y }, end]
  ]
  const fallback = fallbackCandidates.find((route) => !routeCrossesCards(route, blockers)) || fallbackCandidates[0]
  return compactRoute([sourceEdge, ...fallback, targetEdge])
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

function routePath(points: RoutePoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function buildPropertyPositions(rows: PropertyTableRow[]): Record<string, CanvasPosition> {
  const tagRows = new Map<string, PropertyTableRow[]>()
  for (const row of rows) {
    const key = getPrimaryTag(row)
    tagRows.set(key, [...(tagRows.get(key) || []), row])
  }
  const positions: Record<string, CanvasPosition> = {}
  Array.from(tagRows.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([, items], column) => {
      items.forEach((row, index) => {
        positions[row.id] = { x: 40 + column * 270, y: 72 + index * 150 }
      })
    })
  return positions
}

function getCanvasMetrics(rows: PropertyTableRow[], positions: Record<string, CanvasPosition>): CanvasMetrics {
  if (rows.length === 0) {
    return {
      minX: -CANVAS_PADDING,
      minY: -CANVAS_PADDING,
      width: BASE_CANVAS_WIDTH + CANVAS_PADDING * 2,
      height: BASE_CANVAS_HEIGHT + CANVAS_PADDING * 2
    }
  }
  const bounds = rows.reduce(
    (acc, row, index) => {
      const pos = positions[row.id] || defaultPosition(index)
      return {
        minX: Math.min(acc.minX, pos.x),
        minY: Math.min(acc.minY, pos.y),
        maxX: Math.max(acc.maxX, pos.x + CARD_WIDTH),
        maxY: Math.max(acc.maxY, pos.y + CARD_HEIGHT)
      }
    },
    { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 }
  )
  const minX = Math.min(0, bounds.minX) - CANVAS_PADDING
  const minY = Math.min(0, bounds.minY) - CANVAS_PADDING
  const maxX = Math.max(BASE_CANVAS_WIDTH, bounds.maxX) + CANVAS_PADDING
  const maxY = Math.max(BASE_CANVAS_HEIGHT, bounds.maxY) + CANVAS_PADDING
  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function CanvasView({ initialMode = 'space' }: { initialMode?: CanvasMode }) {
  const { t } = useTranslation()
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)
  const setMainView = useUIStore((s) => s.setMainView)
  const [rows, setRows] = useState<PropertyTableRow[]>([])
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [positions, setPositions] = useState<Record<string, CanvasPosition>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [panning, setPanning] = useState<PanState | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(initialMode)
  const canvasRef = useRef<HTMLDivElement>(null)
  const positionsRef = useRef<Record<string, CanvasPosition>>({})
  const metricsRef = useRef(getCanvasMetrics([], {}))
  const previousMetricsRef = useRef(metricsRef.current)
  const initialScrollKeyRef = useRef<string | null>(null)
  const zoomRef = useRef(zoom)
  const pendingScrollRef = useRef<PendingScroll | null>(null)
  const saveViewportTimerRef = useRef<number | null>(null)
  const restoredViewportKeyRef = useRef<string | null>(null)

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    setCanvasMode(initialMode)
  }, [initialMode])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => [
      row.title,
      row.filePath,
      Object.values(row.properties).flat().join(' ')
    ].join(' ').toLowerCase().includes(q))
  }, [rows, query])

  const modePositions = useMemo(() => {
    if (canvasMode === 'time') return buildTimePositions(filteredRows)
    if (canvasMode === 'properties') return buildPropertyPositions(filteredRows)
    return positions
  }, [canvasMode, filteredRows, positions])

  const layoutRows = canvasMode === 'space' ? rows : filteredRows
  const canvasMetrics = useMemo(() => getCanvasMetrics(layoutRows, modePositions), [layoutRows, modePositions])

  useLayoutEffect(() => {
    const previous = previousMetricsRef.current
    metricsRef.current = canvasMetrics
    previousMetricsRef.current = canvasMetrics
    const viewport = canvasRef.current
    if (!viewport) return
    const pendingScroll = pendingScrollRef.current
    if (pendingScroll) {
      pendingScrollRef.current = null
      if (typeof pendingScroll.focusX === 'number' && typeof pendingScroll.focusY === 'number') {
        viewport.scrollLeft = Math.max(0, (pendingScroll.focusX - canvasMetrics.minX) * zoom - viewport.clientWidth / 2)
        viewport.scrollTop = Math.max(0, (pendingScroll.focusY - canvasMetrics.minY) * zoom - viewport.clientHeight / 2)
      } else {
        viewport.scrollLeft = Math.max(0, pendingScroll.left || 0)
        viewport.scrollTop = Math.max(0, pendingScroll.top || 0)
      }
      return
    }
    const dx = (previous.minX - canvasMetrics.minX) * zoom
    const dy = (previous.minY - canvasMetrics.minY) * zoom
    if (dx !== 0) viewport.scrollLeft += dx
    if (dy !== 0) viewport.scrollTop += dy
  }, [canvasMetrics, zoom])

  const loadRows = async (preferred?: PreferredPosition) => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const result = await window.api.invoke('db:get-property-rows', { vaultPath })
      const graphData = await window.api.invoke('db:get-graph', { vaultPath })
      setRows(result)
      setGraph(graphData)
      const saved = safeGetJSON<Record<string, CanvasPosition>>(getCanvasStorageKey(vaultPath), {})
      const archived = buildArchivePositions(result)
      const merged: Record<string, CanvasPosition> = {}
      result.forEach((row, index) => {
        merged[row.id] = row.filePath === preferred?.filePath ? preferred.position : saved[row.id] || archived[row.id] || defaultPosition(index)
      })
      if (preferred) safeSetJSON(getCanvasStorageKey(vaultPath), merged)
      const pendingFocus = getPendingCanvasFocus()
      const focusRow = pendingFocus ? result.find((row) => row.filePath === pendingFocus.filePath) : null
      if (pendingFocus) safeRemove(PENDING_CANVAS_FOCUS_KEY)
      if (focusRow) {
        const position = merged[focusRow.id]
        if (position) {
          pendingScrollRef.current = {
            focusX: position.x + CARD_WIDTH / 2,
            focusY: position.y + CARD_HEIGHT / 2
          }
          initialScrollKeyRef.current = getCanvasInitialScrollKey(vaultPath)
        }
        if (pendingFocus?.mode) setCanvasMode(pendingFocus.mode)
        if (query.trim()) setQuery('')
      }
      setPositions(merged)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [vaultPath])

  useEffect(() => {
    if (!dragging || !vaultPath) return
    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const scrollLeft = canvasRef.current!.scrollLeft
      const scrollTop = canvasRef.current!.scrollTop
      const metrics = metricsRef.current
      const x = (event.clientX - rect.left + scrollLeft) / zoom + metrics.minX - dragging.offsetX
      const y = (event.clientY - rect.top + scrollTop) / zoom + metrics.minY - dragging.offsetY
      setPositions((current) => ({ ...current, [dragging.id]: { x, y } }))
    }
    const handlePointerUp = () => {
      setDragging(null)
      safeSetJSON(getCanvasStorageKey(vaultPath), positionsRef.current)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragging, vaultPath, zoom])

  useEffect(() => {
    if (!panning) return
    const handlePointerMove = (event: PointerEvent) => {
      const viewport = canvasRef.current
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

  useEffect(() => {
    const viewport = canvasRef.current
    if (!viewport || filteredRows.length === 0) return
    const key = getCanvasInitialScrollKey(vaultPath)
    if (initialScrollKeyRef.current === key) return
    initialScrollKeyRef.current = key
    if (vaultPath && restoredViewportKeyRef.current !== key) {
      const saved = safeGetJSON<Partial<CanvasViewportState>>(getCanvasViewportStorageKey(vaultPath), {})
      if (typeof saved.x === 'number' && typeof saved.y === 'number') {
        const nextZoom = Math.max(0.5, Math.min(1.8, typeof saved.zoom === 'number' ? saved.zoom : zoomRef.current))
        const metrics = metricsRef.current
        zoomRef.current = nextZoom
        pendingScrollRef.current = {
          left: (saved.x - metrics.minX) * nextZoom,
          top: (saved.y - metrics.minY) * nextZoom
        }
        restoredViewportKeyRef.current = key
        setZoom(nextZoom)
        return
      }
    }
    requestAnimationFrame(() => {
      const metrics = metricsRef.current
      viewport.scrollLeft = Math.max(0, -metrics.minX * zoom - 44)
      viewport.scrollTop = Math.max(0, -metrics.minY * zoom - 44)
    })
  }, [filteredRows.length, rows.length, vaultPath, zoom])

  const visibleIds = useMemo(() => new Set(filteredRows.map((row) => row.id)), [filteredRows])

  const persistViewport = () => {
    if (!vaultPath) return
    const viewport = canvasRef.current
    if (!viewport) return
    const metrics = metricsRef.current
    safeSetJSON(getCanvasViewportStorageKey(vaultPath), {
      x: viewport.scrollLeft / zoomRef.current + metrics.minX,
      y: viewport.scrollTop / zoomRef.current + metrics.minY,
      zoom: zoomRef.current
    })
  }

  const scheduleViewportSave = () => {
    if (!vaultPath) return
    if (saveViewportTimerRef.current) window.clearTimeout(saveViewportTimerRef.current)
    saveViewportTimerRef.current = window.setTimeout(() => {
      saveViewportTimerRef.current = null
      persistViewport()
    }, 120)
  }

  useEffect(() => {
    return () => {
      if (saveViewportTimerRef.current) window.clearTimeout(saveViewportTimerRef.current)
      persistViewport()
    }
  }, [vaultPath])

  const canvasEdges = useMemo<CanvasEdgeRoute[]>(() => {
    if (!graph) return []
    const blockers = filteredRows.map((row, index) => ({
      id: row.id,
      rect: cardRect(modePositions[row.id] || defaultPosition(index))
    }))
    return graph.edges
      .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      .map((edge) => {
        const source = modePositions[edge.source]
        const target = modePositions[edge.target]
        if (!source || !target) return null
        return {
          key: `${edge.source}->${edge.target}`,
          points: routeBetweenCards(source, target, blockers.filter((blocker) => blocker.id !== edge.source && blocker.id !== edge.target).map((blocker) => blocker.rect)).map((point) => ({
            x: point.x - canvasMetrics.minX,
            y: point.y - canvasMetrics.minY
          }))
        }
      })
      .filter((edge): edge is CanvasEdgeRoute => edge !== null)
  }, [canvasMetrics.minX, canvasMetrics.minY, filteredRows, graph, modePositions, visibleIds])

  const resetLayout = () => {
    const next = buildArchivePositions(rows)
    setPositions(next)
    if (vaultPath) safeSetJSON(getCanvasStorageKey(vaultPath), next)
    requestAnimationFrame(() => {
      const viewport = canvasRef.current
      if (!viewport) return
      const metrics = metricsRef.current
      viewport.scrollLeft = Math.max(0, -metrics.minX * zoom - 44)
      viewport.scrollTop = Math.max(0, -metrics.minY * zoom - 44)
    })
  }

  const canvasWidth = canvasMetrics.width
  const canvasHeight = canvasMetrics.height
  const controlsActive = controlsVisible || showGuide || query.trim().length > 0

  const zoomAtViewportPoint = (nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = canvasRef.current
    const clamped = Math.max(0.5, Math.min(1.8, nextZoom))
    const currentZoom = zoomRef.current
    if (!viewport) {
      zoomRef.current = clamped
      setZoom(clamped)
      return
    }
    const rect = viewport.getBoundingClientRect()
    const focalClientX = clientX ?? rect.left + viewport.clientWidth / 2
    const focalClientY = clientY ?? rect.top + viewport.clientHeight / 2
    const focalX = focalClientX - rect.left
    const focalY = focalClientY - rect.top
    const canvasX = (viewport.scrollLeft + focalX) / currentZoom
    const canvasY = (viewport.scrollTop + focalY) / currentZoom
    zoomRef.current = clamped
    pendingScrollRef.current = {
      left: canvasX * clamped - focalX,
      top: canvasY * clamped - focalY
    }
    setZoom(clamped)
    scheduleViewportSave()
  }

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    const nextZoom = zoomRef.current * Math.exp(-delta * 0.002)
    zoomAtViewportPoint(nextZoom, event.clientX, event.clientY)
  }

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-canvas-card]')) return
    if (target.closest('button,input,textarea,select,a')) return
    if (event.button !== 0 && event.button !== 1) return
    const viewport = canvasRef.current
    if (!viewport) return
    event.preventDefault()
    setPanning({
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    })
  }

  const fitToView = () => {
    const viewport = canvasRef.current
    if (!viewport || filteredRows.length === 0) return
    const bounds = filteredRows.reduce(
      (acc, row, index) => {
        const pos = modePositions[row.id] || defaultPosition(index)
        return {
          minX: Math.min(acc.minX, pos.x),
          minY: Math.min(acc.minY, pos.y),
          maxX: Math.max(acc.maxX, pos.x + CARD_WIDTH),
          maxY: Math.max(acc.maxY, pos.y + CARD_HEIGHT)
        }
      },
      { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 }
    )
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const nextZoom = Math.max(0.5, Math.min(1.4, Math.min((viewport.clientWidth - 80) / width, (viewport.clientHeight - 80) / height)))
    zoomRef.current = nextZoom
    const metrics = metricsRef.current
    pendingScrollRef.current = {
      left: (bounds.minX - metrics.minX) * nextZoom - 40,
      top: (bounds.minY - metrics.minY) * nextZoom - 40
    }
    setZoom(nextZoom)
  }

  const createCanvasNote = async () => {
    if (!vaultPath) return
    const baseTitle = t('canvas.defaultCardTitle')
    let title = baseTitle
    let path = `${vaultPath}/${title}.md`
    for (let index = 2; index < 1000; index++) {
      try {
        await window.api.invoke('file:stat', { path })
        title = `${baseTitle} ${index}`
        path = `${vaultPath}/${title}.md`
      } catch {
        break
      }
    }
    await window.api.invoke('file:create', { path, vaultPath, content: `# ${title}\n\n` })
    await window.api.invoke('db:index-file', { vaultPath, filePath: path })
    const viewport = canvasRef.current
    const metrics = metricsRef.current
    const origin = getViewportCenteredCardOrigin(viewport, metrics, zoomRef.current, rows.length)
    const existingPositions = rows.map((row, index) => positionsRef.current[row.id] || defaultPosition(index))
    const position = findAvailablePosition(origin, existingPositions)
    if (viewport) {
      pendingScrollRef.current = {
        focusX: position.x + CARD_WIDTH / 2,
        focusY: position.y + CARD_HEIGHT / 2
      }
      initialScrollKeyRef.current = getCanvasInitialScrollKey(vaultPath)
    }
    if (query.trim()) setQuery('')
    await loadRows({ filePath: path.slice(vaultPath.length + 1), position })
    toast(t('canvas.created'), 'success')
  }

  const openRow = async (row: PropertyTableRow) => {
    if (!vaultPath) return
    setMainView('editor')
    await openFile(`${vaultPath}/${row.filePath}`)
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--editor-bg)' }}>
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{t('canvas.title')}</div>
          <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-tertiary)' }}>{t('canvas.summary', { count: rows.length, shown: filteredRows.length })}</div>
        </div>
      </div>

      <div
        onMouseEnter={() => setControlsVisible(true)}
        onMouseLeave={() => setControlsVisible(false)}
        onFocusCapture={() => setControlsVisible(true)}
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        <div
          ref={canvasRef}
          onScroll={scheduleViewportSave}
          onWheel={handleCanvasWheel}
          onPointerDown={handleCanvasPointerDown}
          style={{
            height: '100%',
            overflow: 'auto',
            position: 'relative',
            background: 'radial-gradient(circle at 1px 1px, var(--border-subtle) 1px, transparent 0)',
            backgroundSize: '24px 24px',
            cursor: panning ? 'grabbing' : 'grab'
          }}
        >
          {filteredRows.length === 0 ? (
            <div style={{ padding: 32, color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
              <div>{loading ? t('canvas.loading') : t('canvas.empty')}</div>
              {!loading && <button onClick={createCanvasNote} style={{ ...buttonStyle, marginTop: 10 }}>{t('canvas.createFirst')}</button>}
            </div>
          ) : (
            <div style={{ position: 'relative', width: canvasWidth * zoom, height: canvasHeight * zoom }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 0 }}>
                <defs>
                  <marker id="canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L8,4 L0,8 Z" fill="color-mix(in srgb, var(--text-tertiary) 72%, transparent)" />
                  </marker>
                </defs>
                {canvasEdges.map((edge) => (
                  <g key={edge.key}>
                    <path d={routePath(edge.points)} fill="none" stroke="var(--editor-bg)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" strokeOpacity="0.82" />
                    <path d={routePath(edge.points)} fill="none" stroke="color-mix(in srgb, var(--text-tertiary) 58%, transparent)" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" markerEnd="url(#canvas-arrow)" />
                    <path className="knowledge-flow-line" d={routePath(edge.points)} fill="none" stroke="color-mix(in srgb, var(--text-secondary) 75%, transparent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="3 16" />
                  </g>
                ))}
              </svg>
              {filteredRows.map((row, index) => {
                const pos = modePositions[row.id] || defaultPosition(index)
                const tags = Array.isArray(row.properties.tags) ? row.properties.tags.map(String) : []
                const status = valueToText(row.properties.status)
                const source = valueToText(row.properties.source)
                const propertyCount = Object.keys(row.properties).filter((key) => valueToText(row.properties[key])).length
                const groupLabel = canvasMode === 'properties' ? getPrimaryTag(row) : canvasMode === 'time' && row.updatedAt ? new Date(row.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
                return (
                  <div
                    key={row.id}
                    data-canvas-card
                    onPointerDown={(event) => {
                      if (canvasMode !== 'space') return
                      const rect = event.currentTarget.getBoundingClientRect()
                      setDragging({ id: row.id, offsetX: (event.clientX - rect.left) / zoom, offsetY: (event.clientY - rect.top) / zoom })
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onDoubleClick={() => openRow(row)}
                    style={{
                      position: 'absolute',
                      left: pos.x - canvasMetrics.minX,
                      top: pos.y - canvasMetrics.minY,
                      width: CARD_WIDTH,
                      minHeight: 112,
                      padding: '12px 13px 11px',
                      borderRadius: 7,
                      border: dragging?.id === row.id ? '1px solid var(--border-default)' : '1px solid var(--border-subtle)',
                      background: 'color-mix(in srgb, var(--bg-surface) 86%, var(--editor-bg))',
                      boxShadow: dragging?.id === row.id ? '0 14px 34px rgba(0,0,0,0.32)' : '0 8px 20px rgba(0,0,0,0.12)',
                      cursor: canvasMode === 'space' ? dragging?.id === row.id ? 'grabbing' : 'grab' : 'pointer',
                      userSelect: 'none',
                      zIndex: 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div style={{ minWidth: 0, fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupLabel || t('canvas.modeSpace')}</div>
                      <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{propertyCount}</div>
                    </div>
                    <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: 34, fontSize: 13, lineHeight: 1.3, fontWeight: 720, color: 'var(--text-primary)', overflow: 'hidden' }}>{row.title}</div>
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.filePath}</div>
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {tags.slice(0, 3).map((tag) => (
                        <span key={tag} style={{ padding: '2px 6px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 10 }}>{tag}</span>
                      ))}
                      {status && <span style={{ padding: '2px 6px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 10 }}>{status}</span>}
                      {source && <span style={{ padding: '2px 6px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 10 }}>{source}</span>}
                      {tags.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{t('canvas.noTags')}</span>}
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          )}
        </div>

        <div
          data-canvas-controls
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: controlsActive ? 1 : 0.48,
            transform: controlsActive ? 'translateY(0)' : 'translateY(-2px)',
            transition: 'opacity 160ms ease-out, transform 160ms ease-out'
          }}
        >
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('canvas.searchPlaceholder')} style={controlStyle} />
          <div style={floatingGroupStyle}>
            {(['space', 'properties', 'time'] as CanvasMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCanvasMode(mode)}
                style={{
                  height: 30,
                  padding: '0 10px',
                  border: 'none',
                  borderRight: mode === 'time' ? 'none' : '1px solid var(--border-subtle)',
                  background: canvasMode === mode ? 'var(--accent-muted)' : 'transparent',
                  color: canvasMode === mode ? 'var(--accent-text)' : 'var(--text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {mode === 'space' ? t('canvas.modeSpace') : mode === 'properties' ? t('canvas.modeProperties') : t('canvas.modeTime')}
              </button>
            ))}
          </div>
          <div style={floatingGroupStyle}>
            <CanvasIconButton title={t('canvas.guide')} active={showGuide} onClick={() => setShowGuide((value) => !value)}>
              <InfoIcon />
            </CanvasIconButton>
            <CanvasIconButton title={t('canvas.createNote')} disabled={!vaultPath} onClick={createCanvasNote}>
              <NewCardIcon />
            </CanvasIconButton>
          </div>
          <div style={floatingGroupStyle}>
            <CanvasIconButton title={t('canvas.zoomOut')} onClick={() => zoomAtViewportPoint(zoom - 0.1)}>
              <MinusIcon />
            </CanvasIconButton>
            <button onClick={() => zoomAtViewportPoint(1)} title={t('canvas.zoomReset')} style={zoomPercentStyle}>{Math.round(zoom * 100)}%</button>
            <CanvasIconButton title={t('canvas.zoomIn')} onClick={() => zoomAtViewportPoint(zoom + 0.1)}>
              <PlusIcon />
            </CanvasIconButton>
          </div>
          <div style={floatingGroupStyle}>
            <CanvasIconButton title={t('canvas.fitView')} onClick={fitToView}>
              <FitIcon />
            </CanvasIconButton>
            <CanvasIconButton title={t('canvas.reset')} onClick={resetLayout}>
              <ResetIcon />
            </CanvasIconButton>
            <CanvasIconButton title={loading ? t('canvas.loading') : t('canvas.refresh')} disabled={loading} onClick={() => loadRows()}>
              <RefreshIcon />
            </CanvasIconButton>
          </div>
        </div>

        {showGuide && (
          <div style={{ position: 'absolute', top: 62, right: 16, zIndex: 4, width: 360, maxWidth: 'calc(100% - 32px)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.7, boxShadow: '0 16px 42px rgba(0,0,0,0.28)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('canvas.guideTitle')}</div>
            <div>{t('canvas.guideDrag')}</div>
            <div>{t('canvas.guideOpen')}</div>
            <div>{t('canvas.guideLinks')}</div>
            <div>{t('canvas.guideZoom')}</div>
            <div>{t('canvas.guidePan')}</div>
            <div>{t('canvas.guideCreate')}</div>
          </div>
        )}
      </div>
    </div>
  )
}

const controlStyle: React.CSSProperties = {
  width: 256,
  maxWidth: '28vw',
  height: 32,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  boxShadow: '0 10px 28px rgba(0,0,0,0.18)'
}

const buttonStyle: React.CSSProperties = {
  height: 30,
  padding: '0 10px',
  borderRadius: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0
}

const floatingGroupStyle: React.CSSProperties = {
  height: 32,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 7,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  overflow: 'hidden',
  boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
  flexShrink: 0
}

const canvasIconButtonStyle: React.CSSProperties = {
  width: 32,
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  flexShrink: 0
}

const zoomPercentStyle: React.CSSProperties = {
  height: 30,
  minWidth: 52,
  padding: '0 8px',
  border: 'none',
  borderLeft: '1px solid var(--border-subtle)',
  borderRight: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  fontSize: 12,
  cursor: 'pointer'
}

function CanvasIconButton({
  title,
  active = false,
  disabled = false,
  onClick,
  children
}: {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...canvasIconButtonStyle,
        color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
        background: active ? 'var(--accent-muted)' : 'transparent',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      {children}
    </button>
  )
}

function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function NewCardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12h12" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6v12" />
      <path d="M6 12h12" />
    </svg>
  )
}

function FitIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H4a1 1 0 0 0-1 1v4" />
      <path d="M16 3h4a1 1 0 0 1 1 1v4" />
      <path d="M8 21H4a1 1 0 0 1-1-1v-4" />
      <path d="M16 21h4a1 1 0 0 0 1-1v-4" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 0 0-14.9-4" />
      <path d="M5 3v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 4" />
      <path d="M19 21v-4h-4" />
    </svg>
  )
}
